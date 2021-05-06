const ERT = artifacts.require('./ERT.sol');
const Controller = artifacts.require('./Controller.sol');
const StakeAndYield = artifacts.require("./StakeAndYield.sol");
const YearnStrategy = artifacts.require('./YearnStrategy.sol')

const toWei = (number) => number * Math.pow(10, 6);
const fromWei = (x) => x/1e6;
const addr0 = "0x0000000000000000000000000000000000000000";
const bytes0 = "0x0000000000000000000000000000000000000000000000000000000000000000";


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

const timeController = (() => {
    const addSeconds = (seconds) => new Promise((resolve, reject) => 
        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [seconds],
            id: new Date().getTime()
        }, (error, result) => {
            web3.currentProvider.send({
                jsonrpc: '2.0', 
                method: 'evm_mine', 
                params: [], 
                id: new Date().getSeconds()
            }, (err, res) => resolve(res));
        }));
    

    const addDays = (days) => addSeconds(days * 24 * 60 * 60);
    const addHours = (hours) => addSeconds(hours * 60 * 60);

    const currentTimestamp = () => web3.eth.getBlock(web3.eth.blockNumber).timestamp;

    return {
        addSeconds,
        addDays,
        addHours,
        currentTimestamp
    };
})();

const ethBalance = (address) => web3.eth.getBalance(address);

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
    const createStrategy = (vault, cn) => YearnStrategy.new(
        vault, cn,
        {from: admin}
    );

    it('create test', async() => {
        const controller = await createController();
        const token = await createToken();

        const vault = await createStake(token.address, 
            controller.address);
        const stra = await createStrategy(vault.address,
            controller.address);

        await controller.addStrategy(
            vault.address, stra.address, 
            token.address, toWei(1),
            {from:admin}
        );
        await token.mint(accounts[2], toWei(1000), {from:admin});

        await token.approve(vault.address, toWei(10000), 
            {from:accounts[2]} );

        await vault.deposit(toWei(100), 2, false, {from:accounts[2]});

        //console.log(fromWei(await stra.pendingBalance()));

        await vault.notifyRewardAmount(toWei(10), 2, {from:admin});

        await timeController.addDays(90);
        
        await vault.setExit(true, {from: accounts[2]});

        // console.log(
        //     fromWei(await vault.earned(accounts[2], {from: accounts[2]}))
        // );
        //await stra.epoch(toWei(0.1), {from:admin});

    });

});
