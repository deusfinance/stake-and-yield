const Web3 = require('web3');
const web3 = new Web3('https://mainnet.infura.io/v3/dc255cb746804c658bcd31cad3d29f23');
require('dotenv').config();

const AETHABI = require('./abis/aeth.json');
const yearnABI = require('./abis/yearn_vault.json');
const ERC20ABI = require('./abis/erc20.json');
const curveABI = require('./abis/curve.json');

const AETH = "0xaa17a236f2badc98ddc0cf999abb47d47fc0a6cf";
const YearnVault = "0x132d8D2C76Db3812403431fAcB00F3453Fc42125";

const controller = "0x4e8a7c429192bfda8c9a1ef0f3b749d0f66657aa";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const curve = "0xA96A65c051bF88B4095Ee1f2451C2A9d43F53Ae2";

const BN = (x) => new web3.utils.BN(x);

const AETHContract = new web3.eth.Contract(
    AETHABI, AETH);

const YearnVaultContract = new web3.eth.Contract(
    yearnABI, YearnVault);

const WETHContract = new web3.eth.Contract(
    ERC20ABI, WETH);

const curveContract = new web3.eth.Contract(
    curveABI, curve);

async function controllerBalance(){
	return await YearnVaultContract.methods.withdraw().call(
        {from: controller}
    );
}

async function controllerBalanceOld(){
	var yearnBalance = await YearnVaultContract.methods.balanceOf(
		controller
	).call();
	var yearnAETHBalance = BN(yearnBalance).mul(
		BN(await YearnVaultContract.methods.pricePerShare().call())
	).div(BN((1e18).toString()))

	var aethAmount = await AETHContract.methods.balanceOf(
		controller).call();
	aethAmount = yearnAETHBalance.add(BN(aethAmount));

	// calculate equal ETH amount
	// TODO: consider fees
	var curveETHAmount = await curveContract.methods.calc_withdraw_one_coin(
		aethAmount, 0
	).call();

	// + WETH amount
	curveETHAmount = BN(curveETHAmount).add(
		BN(await WETHContract.methods.balanceOf(controller).call())
	);
	//console.log(curveETHAmount.toString());
	return [curveETHAmount, aethAmount];
}

//controllerBalance().then(x => console.log(x));

module.exports = {
	controllerBalance
}
