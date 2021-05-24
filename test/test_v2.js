const ERT = artifacts.require('./ERT.sol');
const Controller = artifacts.require('./Controller.sol');
const StakeAndYield = artifacts.require("./StakeAndYield.sol");
const StakeAndYieldV2 = artifacts.require("./StakeAndYieldV2.sol");
const YearnStrategy = artifacts.require('./YearnCrvAETHStrategy.sol')

const toWei = (number) => web3.utils.toWei(number.toString());
const fromWei = (x) => web3.utils.fromWei(x);
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

    const createStakeV2 = (token, cn, oldCn) => StakeAndYieldV2.new(
        token, token, token,
        0, admin, cn, true, oldCn,
        {from: admin}
    );

    const createStrategy = (vault, cn) => YearnStrategy.new(
        vault, cn,
        {from: admin}
    );

    it('deploying contracts', async() => {
        const controller = await createController();
        const token = await createToken();

        const vault = await createStake(token.address, 
            controller.address);
        const stra = await createStrategy(vault.address,
            controller.address);
        
        const vault2 = await createStakeV2(
            token.address, 
            controller.address,
            vault.address
        );
    });

    it('old user deposit', async() => {
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

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault.address, toWei(10000), 
            {from:accounts[2]} );
        await vault.deposit(toWei(100), 2, false, {from:accounts[2]});

        //time shift
        await timeController.addDays(10);

        //deploy second contract
        const vault2 = await createStakeV2(token.address, 
            controller.address, vault.address);
        const stra2 = await createStrategy(vault2.address,
            controller.address);


        //deposit to new contract
        await token.approve(vault2.address, toWei(10000), 
            {from:accounts[2]} );
        await vault2.deposit(toWei(100), 2, false, {from:accounts[2]});

        var user = await vault2.users(accounts[2]);
        assert.equal(fromWei(user.balance), 200, "old user balance mismatch");

        // re-deposit
        await vault2.deposit(toWei(100), 2, false, {from:accounts[2]});
        user = await vault2.users(accounts[2]);
        assert.equal(fromWei(user.balance), 300, "old user re-deposit error");
    });

    it('new user deposit', async() => {
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

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), 
            {from:accounts[2]} );
        await vault2.deposit(toWei(100), 2, false, {from:accounts[2]});

        var user = await vault2.users(accounts[2]);
        assert.equal(fromWei(user.balance), 100, "new user balance mismatch");
    });

    it('exit balance', async() => {
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

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), 
            {from:accounts[2]} );
        await vault2.deposit(toWei(100), 2, true, {from:accounts[2]});

        //time shift
        await timeController.addDays(9);
        var balance = await vault2.exitBalance(accounts[2], {
            from: accounts[2]
        });
        assert.equal(fromWei(balance), 10, "10% exit balance mismatch");
        
        //time shift
        await timeController.addDays(45-9);

        balance = await vault2.exitBalance(accounts[2], {
            from: accounts[2]
        });
        assert.equal(fromWei(balance), 50, "50% exit balance mismatch");

        //time shift more than 90 days
        await timeController.addDays(45+5);

        balance = await vault2.exitBalance(accounts[2], {
            from: accounts[2]
        });
        assert.equal(fromWei(balance), 100, "100% exit balance mismatch");
    });

    it('claim', async() => {
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

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.approve(vault2.address, toWei(10000), 
            {from:accounts[2]} );
        await vault2.deposit(toWei(10000), 2, false, {from:accounts[2]});

        //time shift
        await vault2.notifyRewardAmount(toWei(1000), 2, {
            from:admin
        });
        await timeController.addDays(3);
        var b = await vault2.earned(accounts[2]);
        assert.equal(fromWei(b), 1000);

        //unfreeze should claim
        var balanceBefore = await token.balanceOf(accounts[2]);
        await vault2.unfreezeAllAndClaim({from: accounts[2]});
        
        var b = await vault2.earned(accounts[2]);
        assert.equal(fromWei(b), 1000);

        await vault2.claim({from: accounts[2]});
        var balanceAfter = await token.balanceOf(accounts[2]);

        assert.equal(parseFloat(fromWei(balanceAfter)) - parseFloat(fromWei(balanceBefore)), 1000);
        //console.log(fromWei(balanceBefore), fromWei(balanceAfter));

        var b = await vault2.earned(accounts[2]);
        assert.equal(fromWei(b), 0);
    });

    it('create test', async() => {
        return;
        const controller = await createController();
        const token = await createToken();

        const vault = await createStake(token.address, 
            controller.address);
        const stra = await createStrategy(vault.address,
            controller.address);
        // console.log((await stra.getTest()).toString());
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

        //await vault.notifyRewardAmount(toWei(10), 2, {from:admin});

        //await timeController.addDays(90);
        
        //await vault.setExit(true, {from: accounts[2]});

        // console.log(
        //     fromWei(await vault.earned(accounts[2], {from: accounts[2]}))
        // );
        //await stra.epoch(toWei(0.1), {from:admin});

        await stra.epoch(toWei(0.22576099210823), {from: admin});
        print(aa);
    });

});
