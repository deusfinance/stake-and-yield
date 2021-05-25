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
    roundBN,
} = require('../helpers');


const transaction = (address, wei) => ({
    from: address,
    value: wei
});

const fail = (msg) => (error) => assert(false, error ?
    `${msg}, but got error: ${error.message}` : msg);

const revertExpectedError = async(promise) => {
    try {
        await promise;
        fail('expected to fail')();
    } catch (error) {
        assert(error.message.indexOf('revert') >= 0 || error.message.indexOf('invalid opcode') >= 0,
            `Expected revert, but got: ${error.message}`);
    }
}

contract('Controller', accounts => {

    const admin = accounts[1];
    const oneEth = toWei(1);

    const testAsync = async() => {
        const response = await new Promise(resolve => {
            setTimeout(() => {
            }, 1000);
        });
    }

    const createToken = () => ERT.new({ from: admin });
    const createController = () => Controller.new({from:admin});
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

    const createStrategy = (vault, cn) => YearnStrategy.new(
        vault, cn,
        {from: admin}
    );

    const deployAllContracts = async () => {
        const controller = await createController();
        const token = await createToken();

        const vault = await createStake(token.address, 
            controller.address);
        const stra = await createStrategy(vault.address,
            controller.address);
        
        await controller.addStrategy(
            vault.address, stra.address, 
            token.address, toWei(1),
            token.address, token.address,
            {from:admin}
        );

        //deploy second contract
        const vault2 = await createStakeV2(token.address, 
            controller.address, vault.address);
        const stra2 = await createStrategy(vault2.address,
            controller.address);

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

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), {from:accounts[2]} );
        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_TRUE, {from:accounts[2]});

        //time shift
        await timeController.addDays(9);
        var balance = await vault2.exitBalance(accounts[2], {
            from: accounts[2]
        });
        assert.equal(roundBN(balance), 10, "10% exit balance mismatch");
        
        //time shift
        await timeController.addDays(45-9);

        balance = await vault2.exitBalance(accounts[2], {from: accounts[2]});
        assert.equal(roundBN(balance), 50, "50% exit balance mismatch");

        //time shift more than 90 days
        await timeController.addDays(45+5);

        balance = await vault2.exitBalance(accounts[2], {
            from: accounts[2]
        });
        assert.equal(roundBN(balance), 100, "100% exit balance mismatch");
    });

    it('scenario #2', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), {from:accounts[2]} );
        await vault2.deposit(toWei(100), TYPE_YIELD, EXIT_TRUE, {from:accounts[2]});

        //time shift
        await timeController.addDays(45);
        var balance = await vault2.exitBalance(accounts[2], {from: accounts[2]});
        assert.equal(roundBN(balance), 50, "#1 exit balance mismatch");

        // deposit 150 token
        await vault2.deposit(toWei(150), TYPE_YIELD, EXIT_TRUE, {from:accounts[2]});
        var balance = await vault2.exitBalance(accounts[2], {from: accounts[2]});
        assert.equal(roundBN(balance), 50, "#2 exit balance mismatch");

        //
        await timeController.addDays(45);
        var balance = await vault2.exitBalance(accounts[2], {from: accounts[2]});
        assert.equal(roundBN(balance), 150, "#3 exit balance mismatch");

        // deposit again
        await vault2.deposit(toWei(200), TYPE_YIELD, EXIT_TRUE, {from:accounts[2]});
        var balance = await vault2.exitBalance(accounts[2], {from: accounts[2]});
        assert.equal(roundBN(balance), 150, "#4 exit balance mismatch");

        await timeController.addDays(30);
        var balance = await vault2.exitBalance(accounts[2], {from: accounts[2]});
        assert.equal(roundBN(balance), 250, "#5 exit balance mismatch");
    });

});
