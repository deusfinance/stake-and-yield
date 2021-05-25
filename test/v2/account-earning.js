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

    it('account-earning scenario #1', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        let earned;
        const PERIOD = parseInt(await vault2.PERIOD.call());

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), {from:accounts[2]} );

        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_FALSE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(480), TYPE_YIELD, {from: admin});
        
        await timeController.addSeconds(PERIOD / 2);
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(earned), 240, "#1 balance mismatch");
        
        await timeController.addSeconds(PERIOD / 2);
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(earned), 480, "#2 balance mismatch");
    });

    it('account-earning scenario #2', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        let earned;
        const PERIOD = parseInt(await vault2.PERIOD.call());

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.mint(accounts[3], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), {from:accounts[2]} );
        await token.approve(vault2.address, toWei(10000), {from:accounts[3]} );

        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_FALSE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(480), TYPE_YIELD, {from: admin});
        
        await timeController.addSeconds(PERIOD / 2);
        // await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_FALSE, {from:accounts[3]});
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(earned), 240, "#1 balance mismatch");
        
        // await timeController.addHours(12);
        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_FALSE, {from:accounts[3]});
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(earned), 240, "#2 balance mismatch");
        
        await timeController.addSeconds(PERIOD + 60);
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(earned), 360, "#3 balance mismatch");
        earned = await vault2.earned(accounts[3]);
        assert.equal(roundBN(earned), 120, "#4 balance mismatch");
    });

    it('account-earning scenario #3', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        let earned;
        const PERIOD = parseInt(await vault2.PERIOD.call());

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.mint(accounts[3], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), {from:accounts[2]} );
        await token.approve(vault2.address, toWei(10000), {from:accounts[3]} );

        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_FALSE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(480), TYPE_YIELD, {from: admin});
        
        await timeController.addSeconds(PERIOD / 2);
        
        // await timeController.addHours(12);
        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_FALSE, {from:accounts[3]});
        await vault2.notifyRewardAmount(toWei(240), TYPE_YIELD, {from: admin});
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(earned), 240, "#1 balance mismatch");
        
        await timeController.addSeconds(PERIOD + 60);
        earned = await vault2.earned(accounts[2]);
        assert.equal(roundBN(earned), 480, "#2 balance mismatch");
        earned = await vault2.earned(accounts[3]);
        assert.equal(roundBN(earned), 240, "#3 balance mismatch");
    });
});
