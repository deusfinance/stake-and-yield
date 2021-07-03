const Web3 = require('web3');
const web3 = new Web3('https://mainnet.infura.io/v3/dc255cb746804c658bcd31cad3d29f23');
require('dotenv').config()
const utils = require('./utils');
//var ABI = require('./abis');

const BN = x => new web3.utils.BN(x);
var addr0 = "0x0000000000000000000000000000000000000000";

const uniswapRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const uniswapRouterABI = require('./abis/uniswap_router.json');

const AMM = "0xD77700fC3C78d1Cb3aCb1a9eAC891ff59bC7946D";

const AMMABI = require('./abis/amm.json');
const vaultABI = require('./abis/stake_and_yield.json');
const ERC20ABI = require('./abis/erc20.json');
const BPTABI = require('./abis/bpt.json');
const STRA_ABI = require('./abis/yearn_strategy_v2.json')

const DEA = "0x80aB141F324C3d6F2b18b030f1C4E95d4d658778";
const DEUS = "0x3b62F3820e0B035cc4aD602dECe6d796BC325325";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const BPT = "0x1Dc2948B6dB34E38291090B825518C1E8346938B";

const sDEAVault = "0xd95cd888D1d39F5fEE61e8E58072f70dcFF2b34D";
const sDEUSVault = "0xcca75b648097b7d378b293af702ce328a630e5e7";
const bptVault = "0x1ad1b81d0095924a4b50717941f1be254f2cb4dc";

const DEAContract = new web3.eth.Contract(
    ERC20ABI, DEA);

const DEUSContract = new web3.eth.Contract(
    ERC20ABI, DEUS);

const BPTCOntract = new web3.eth.Contract(
    BPTABI, BPT);

const uniswapRouterContract = new web3.eth.Contract(
    uniswapRouterABI, uniswapRouter);

const AMMContract = new web3.eth.Contract(
    AMMABI, AMM);

const sDEAVaultContract = new web3.eth.Contract(
    vaultABI, sDEUSVault);

const sDEUSVaultContract = new web3.eth.Contract(
    vaultABI, sDEAVault);

const bptVaultContract = new web3.eth.Contract(
    vaultABI, bptVault);


const sdeaStra = "0x5f760949eA97F47C4c459184A811653623dC6909";
const sDeaStraContract = new web3.eth.Contract(
    STRA_ABI, sdeaStra
);

const sdeusStra = "0xff7f0d570268e4790dc106bb077b3cff95ac9695";
const sDeusStraContract = new web3.eth.Contract(
    STRA_ABI, sdeusStra
);

const bptStra = "0x98e836edefe7a65d76aee8a012c9e19305d0d592";
const bptStraContract = new web3.eth.Contract(
    STRA_ABI, bptStra
);

const fromWei = web3.utils.fromWei;
const toWei = web3.utils.toWei;

const aethPushedToContracts = 1753.86;
const ethPushedToContracts = 1747;

async function calcETH(amount, path){
    var x = await uniswapRouterContract.methods.getAmountsOut(
        BN(amount),
        path
    ).call();
    var i = x[x.length-1];
    return i;
}

async function bptToETH(amount){
    console.log(amount, "amount");
    bpt_amount = amount;

    dea_in_pool = await DEAContract.methods.balanceOf(BPT).call()
    dea_weight = "19387755102040500000"
    bpt_supply = await BPTCOntract.methods.totalSupply().call()
    total_weight = "50000000000000000000"
    swap_fee = "10000000000000000"
    path = [DEA, DEUS]

    console.log(dea_in_pool, dea_weight, bpt_supply, total_weight, bpt_amount, swap_fee);

    dea_amount = await BPTCOntract.methods.calcSingleInGivenPoolOut(dea_in_pool, dea_weight, bpt_supply, total_weight, bpt_amount, swap_fee).call()
    console.log(dea_amount, 'dea')

    deus_amount = await uniswapRouterContract.methods.getAmountsOut(dea_amount, path).call()
    deus_amount = deus_amount[deus_amount.length-1]
    console.log(deus_amount, 'deus')

    eth_amount = await AMMContract.methods.calculateSaleReturn(deus_amount).call()
    console.log(eth_amount, 'eth')
    return eth_amount;

    // console.log('eth price', eth_price)

    // bpt_price = (eth_amount / bpt_amount) * eth_price
    // console.log('bpt price, bpt_amount', bpt_price, bpt_amount);
    // return parseInt(bpt_price * 1e18).toString();
}

async function calcTotal(){
    var DEAPath = [
        DEA,
        DEUS
    ];
    var deaAmount = await sDEAVaultContract.methods.totalSupply(
        2
    ).call();
    var deusAmount = await sDEUSVaultContract.methods.totalSupply(
        2
    ).call();
    var bptAmount = await bptVaultContract.methods.totalSupply(
        2
    ).call();

    console.log('bptAmount', bptAmount);

    var deaETHAmount = await AMMContract.methods.calculateSaleReturn(
        await calcETH(deaAmount, DEAPath)    
    ).call()

    var deusETHAmount = await AMMContract.methods.calculateSaleReturn(
        deusAmount
    ).call();

    var bptETHAmount = await bptToETH(bptAmount);

    console.log(`sDEA: ${fromWei(deaAmount)} (${fromWei(deaETHAmount)} ETH)`);
    console.log(`sDEUS: ${fromWei(deusAmount)} (${fromWei(deusETHAmount)} ETH)`);
    console.log(`BPT: ${fromWei(bptAmount)} (${fromWei(bptETHAmount)} ETH)`);

    var total = (BN(deaETHAmount)).add(BN(deusETHAmount)).add(
        BN(bptETHAmount)
    );
    console.log(`Total: ${fromWei(total)} ETH\n`); 

    return {
            total,
            bptETHAmount,
            deusETHAmount,
            deaETHAmount
        };       
}

async function run(){
    var total = await calcTotal();
    var aETHAmount = await utils.controllerBalance();

    //console.log(BN(total).toString(), totalBalance.toString());
    console.log(`Pushed to contracts until now: ${ethPushedToContracts} ETH`)

    var pushed = BN(toWei(aethPushedToContracts.toString()));
    var pushedETH = BN(toWei(ethPushedToContracts.toString()));

    var needed = total.total.sub(pushedETH);

    console.log(`ETH needed: ${fromWei(needed)}`);

    var rewards = BN(aETHAmount).sub(pushed);

    console.log(`CurveAETH balance: ${fromWei(aETHAmount)}`);
    console.log(`Payout: ${fromWei(rewards)} CurveAETH`)

    rewards = BN('13241008168559061775');
    var sDeaRewards = rewards.mul(BN(total.deaETHAmount)).div(
        total.total
    );
    var sDeusRewards = rewards.mul(BN(total.deusETHAmount)).div(
        total.total
    );
    var bptRewards = rewards.mul(BN(total.bptETHAmount)).div(
        total.total
    );

    console.log(
        sDeaRewards.toString(),
        0,
        0,
        0,
        needed.toString()
    );

    console.log(
        sDeusRewards.toString(),
        0,
        0,
        0,
        0
    );

    console.log(
        bptRewards.toString(),
        0,
        0,
        0,
        0
    );
}


run().then(x => {})
