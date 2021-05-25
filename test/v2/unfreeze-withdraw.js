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

    it('unfreeze-withdraw scenario #1', async() => {
        const {controller, token, vault, stra, vault2, stra2} = await deployAllContracts()
        const PERIOD = parseInt(await vault2.PERIOD.call());
        const EPOCH_PERIOD = parseInt(await vault2.EPOCH_PERIOD.call());
        let balance, earned;

        // deposit to old contract
        await token.mint(accounts[2], toWei(10000), {from:admin});
        await token.mint(admin, toWei(10000), {from:admin});
        await token.transfer(vault2.address, toWei(6000), {from: admin})
        await token.approve(vault2.address, toWei(10000), {from:accounts[2]} );

        await vault2.deposit(toWei(10000), TYPE_YIELD, EXIT_FALSE, {from:accounts[2]});
        await vault2.notifyRewardAmount(toWei(5000), TYPE_YIELD, {from: admin});

        timeController.addSeconds(PERIOD / 2)
        earned = roundBN(await vault2.earned(accounts[2]));
        console.log(`earned before unfreeze: ${earned}`)
        // await vault2.unfreezeAllAndClaim({from: accounts[2]});
        await vault2.unfreeze(toWei(10000), {from: accounts[2]});

        timeController.addSeconds(PERIOD / 2)

        earned = roundBN(await vault2.earned(accounts[2]));
        console.log(`earned after unfreeze: ${earned}`)

        timeController.addSeconds(PERIOD + EPOCH_PERIOD + 3600)
        await vault2.withdrawUnfreezed({from: accounts[2]})

        earned = roundBN(await vault2.earned(accounts[2]));
        console.log(`earned after withdraw: ${earned}`)
    });
});
