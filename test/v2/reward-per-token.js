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

    it('scenario #1', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        let rewardPerToken;

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), {from:accounts[2]} );

        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_TRUE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(480), TYPE_YIELD, {from:accounts[1]});

        rewardPerToken = await vault2.rewardPerToken(TYPE_YIELD);
        assert.equal(fromWei(rewardPerToken), 0, "#1 rewardPerToken mismatch");

        await timeController.addHours(12);
        rewardPerToken = await vault2.rewardPerToken(TYPE_YIELD);
        assert.equal(fromWei(rewardPerToken), 2.4, "#2 rewardPerToken mismatch");

        await timeController.addHours(12);
        rewardPerToken = await vault2.rewardPerToken(TYPE_YIELD);
        assert.equal(fromWei(rewardPerToken), 4.8, "#3 rewardPerToken mismatch");

        await timeController.addHours(12);
        rewardPerToken = await vault2.rewardPerToken(TYPE_YIELD);
        assert.equal(fromWei(rewardPerToken), 4.8, "#3 rewardPerToken mismatch");
    });

    it('scenario #2', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        let rewardPerToken;

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), {from:accounts[2]} );

        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_TRUE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(480), TYPE_YIELD, {from:accounts[1]});

        rewardPerToken = await vault2.rewardPerToken(TYPE_YIELD);
        assert.equal(fromWei(rewardPerToken), 0, "#1 rewardPerToken mismatch");

        await timeController.addHours(12);
        rewardPerToken = await vault2.rewardPerToken(TYPE_YIELD);
        assert.equal(fromWei(rewardPerToken), 2.4, "#2 rewardPerToken mismatch");

        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_TRUE, {from:accounts[2]});
        rewardPerToken = await vault2.rewardPerToken(TYPE_YIELD);
        assert.equal(fromWei(rewardPerToken), 1.2, "#3 rewardPerToken mismatch");

        await timeController.addHours(12);
        rewardPerToken = await vault2.rewardPerToken(TYPE_YIELD);
        assert.equal(fromWei(rewardPerToken), 2.4, "#4 rewardPerToken mismatch");

        await timeController.addHours(96);
        rewardPerToken = await vault2.rewardPerToken(TYPE_YIELD);
        assert.equal(fromWei(rewardPerToken), 2.4, "#5 rewardPerToken mismatch");
    });
});
