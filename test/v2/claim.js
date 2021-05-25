const ERT = artifacts.require('./ERT.sol');
const Controller = artifacts.require('./Controller.sol');
const StakeAndYield = artifacts.require("./StakeAndYield.sol");
const StakeAndYieldV2 = artifacts.require("./StakeAndYieldV2.sol");
const YearnStrategy = artifacts.require('./YearnCrvAETHStrategy.sol')

const {
    timeController, 
    fromWei, 
    toWei, 
    addr0, bytes0,
    ethBalance,
    TYPE_STAKE, TYPE_YIELD, TYPE_BOTH,
    EXIT_TRUE, EXIT_FALSE,
    expect,
} = require('../helpers');

const roundBN = (bn, n=3) => {
    const coefficient = 10**n;
    return Math.round(parseFloat(fromWei(bn)) * coefficient) / coefficient;
}

contract('StakeAndYieldV2', accounts => {

    const admin = accounts[1];
    const oneEth = toWei(1);

    const createStake = (token, cn) => StakeAndYield.new(
        token, token, token,
        0, admin, cn, true,
        {from: admin}
    );

    const createStakeV2 = (token, cn, oldCn) => StakeAndYieldV2.new(
        token, token, token,
        0, admin, cn, true, oldCn,
        {from: admin}
    );

    const deployAllContracts = async () => {
        const controller = await Controller.new({from:admin});
        const token = await ERT.new({ from: admin });

        const vault = await createStake(token.address, controller.address);
        const stra = await YearnStrategy.new(vault.address, controller.address, {from: admin});
        
        await controller.addStrategy(
            vault.address, stra.address, 
            token.address, toWei(1),
            token.address, token.address,
            {from:admin}
        );

        //deploy second contract
        const vault2 = await createStakeV2(token.address, controller.address, vault.address);
        const stra2 = await YearnStrategy.new(vault2.address, controller.address, {from: admin});

        return {
            controller,
            token,
            vault,
            stra,
            vault2,
            stra2
        }
    }

    it('claim scenario #1', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        const PERIOD = parseInt(await vault2.PERIOD.call());
        let balance, earned;

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), {from:accounts[2]} );

        await vault2.deposit(toWei(800), TYPE_YIELD, EXIT_FALSE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(480), TYPE_YIELD, {from: admin});
        
        await timeController.addSeconds(PERIOD + 60);
        earned = await vault2.earned(accounts[2]);
        balance = await vault2.balanceOf(accounts[2], TYPE_YIELD);
        assert.equal(roundBN(balance), 800, "#1 balance mismatch");
        assert.equal(roundBN(earned), 480, "#2 earned mismatch");

        await vault2.claim({from: accounts[2]});
        earned = await vault2.earned(accounts[2]);
        balance = await token.balanceOf(accounts[2]);
        assert.equal(roundBN(balance), 10000-800+480, "#3 balance mismatch");
        assert.equal(roundBN(earned), 0, "#4 earned mismatch");
    });

    it('claim scenario #2', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        const PERIOD = parseInt(await vault2.PERIOD.call());
        let balance, earned;

        // deposit to old contract
        await token.mint(accounts[2], toWei(5000), {from:admin});
        await token.approve(vault2.address, toWei(1000), {from:accounts[2]} );

        await vault2.deposit(toWei(1000), TYPE_YIELD, EXIT_FALSE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(800), TYPE_YIELD, {from: admin});
        
        await timeController.addSeconds(PERIOD / 2);
        earned = await vault2.earned(accounts[2]);
        balance = await vault2.balanceOf(accounts[2], TYPE_YIELD);
        assert.equal(roundBN(balance), 1000, "#1 balance mismatch");
        assert.equal(roundBN(earned), 400, "#2 earned mismatch");

        await vault2.claim({from: accounts[2]});
        earned = await vault2.earned(accounts[2]);
        balance = await token.balanceOf(accounts[2]);
        assert.equal(roundBN(balance), 5000-1000+400, "#3 balance mismatch");
        assert.equal(roundBN(earned), 0, "#4 earned mismatch");
        
        await timeController.addSeconds(PERIOD / 2 + 60);
        earned = await vault2.earned(accounts[2]);
        balance = await vault2.balanceOf(accounts[2], TYPE_YIELD);
        assert.equal(roundBN(balance), 1000, "#5 balance mismatch");
        assert.equal(roundBN(earned), 400, "#6 earned mismatch");

        await vault2.claim({from: accounts[2]});
        earned = await vault2.earned(accounts[2]);
        balance = await token.balanceOf(accounts[2]);
        assert.equal(roundBN(balance), 5000-1000+800, "#7 balance mismatch");
        assert.equal(roundBN(earned), 0, "#8 earned mismatch");
    });

    it('claim scenario #3', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        const PERIOD = parseInt(await vault2.PERIOD.call());
        let vaultBalance, tokenBalance, earned, claimResult;

        // deposit to old contract
        await token.mint(accounts[2], toWei(5000), {from:admin});
        await token.approve(vault2.address, toWei(1000), {from:accounts[2]} );

        await vault2.deposit(toWei(1000), TYPE_YIELD, EXIT_FALSE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(800), TYPE_YIELD, {from: admin});
        
        await timeController.addSeconds(PERIOD + 60);
        claimResult = await vault2.claim({from: accounts[2]});
        expect.eventEmitted(claimResult, "RewardClaimed", ev => {
            return ev.user == accounts[2] && roundBN(ev.yieldAmount) == '800'
        })

        vaultBalance = await vault2.balanceOf(accounts[2], TYPE_YIELD);
        tokenBalance = await token.balanceOf(accounts[2]);
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(vaultBalance), 1000, "#1 vault balance mismatch");
        assert.equal(roundBN(tokenBalance), 5000-1000+800, "#2 token balance mismatch");
        assert.equal(roundBN(earned), 0, "#3 earned mismatch");

        await timeController.addSeconds(PERIOD + 60);
        claimResult = await vault2.claim({from: accounts[2]});
        expect.eventNotEmitted(claimResult, "RewardClaimed", ev => {
            return ev.user == accounts[2]
        })

        vaultBalance = await vault2.balanceOf(accounts[2], TYPE_YIELD);
        tokenBalance = await token.balanceOf(accounts[2]);
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(vaultBalance), 1000, "#4 vault balance mismatch");
        assert.equal(roundBN(tokenBalance), 5000-1000+800, "#5 token balance mismatch");
        assert.equal(roundBN(earned), 0, "#6 earned mismatch");
    });

    it('claim scenario #4', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        const PERIOD = parseInt(await vault2.PERIOD.call());
        let vaultBalance, tokenBalance, earned, claimResult;

        // deposit to old contract
        await token.mint(accounts[2], toWei(5000), {from:admin});
        await token.mint(accounts[3], toWei(5000), {from:admin});
        await token.approve(vault2.address, toWei(1000), {from:accounts[2]} );
        await token.approve(vault2.address, toWei(1000), {from:accounts[3]} );

        await vault2.deposit(toWei(1000), TYPE_YIELD, EXIT_FALSE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(800), TYPE_YIELD, {from: admin});
        
        await timeController.addSeconds(PERIOD/2);
        claimResult = await vault2.claim({from: accounts[2]});
        expect.eventEmitted(claimResult, "RewardClaimed", ev => {
            return ev.user == accounts[2] && roundBN(ev.yieldAmount) == '400'
        })
        vaultBalance = await vault2.balanceOf(accounts[2], TYPE_YIELD);
        tokenBalance = await token.balanceOf(accounts[2]);
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(vaultBalance), 1000, "#1 vault balance mismatch");
        assert.equal(roundBN(tokenBalance), 5000-1000+400, "#2 token balance mismatch");
        assert.equal(roundBN(earned), 0, "#3 earned mismatch");

        await vault2.deposit(toWei(1000), TYPE_YIELD, EXIT_FALSE, {from:accounts[3]});
        await vault2.notifyRewardAmount(toWei(1000), TYPE_YIELD, {from: admin});

        await timeController.addSeconds(PERIOD/2);
        claimResult = await vault2.claim({from: accounts[2]});
        expect.eventEmitted(claimResult, "RewardClaimed", ev => {
            return ev.user == accounts[2] && roundBN(ev.yieldAmount) == '350'
        })
        vaultBalance = await vault2.balanceOf(accounts[2], TYPE_YIELD);
        tokenBalance = await token.balanceOf(accounts[2]);
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(vaultBalance), 1000, "#4 vault balance mismatch");
        assert.equal(roundBN(tokenBalance), 5000-1000+400+350, "#5 token balance mismatch");
        assert.equal(roundBN(earned), 0, "#6 earned mismatch");

        await timeController.addSeconds(PERIOD/2);
        claimResult = await vault2.claim({from: accounts[2]});
        expect.eventEmitted(claimResult, "RewardClaimed", ev => {
            return ev.user == accounts[2] && roundBN(ev.yieldAmount) == '350'
        })
        vaultBalance = await vault2.balanceOf(accounts[2], TYPE_YIELD);
        tokenBalance = await token.balanceOf(accounts[2]);
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(vaultBalance), 1000, "#7 vault balance mismatch");
        assert.equal(roundBN(tokenBalance), 5000-1000+400+700, "#8 token balance mismatch");
        assert.equal(roundBN(earned), 0, "#9 earned mismatch");
    });
});
