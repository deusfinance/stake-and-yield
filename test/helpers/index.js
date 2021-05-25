const timeController = require('./time-controller')
const wait = require('./wait')
const expect = require('./expect');

const TYPE_STAKE = 1;
const TYPE_YIELD = 2;
const TYPE_BOTH = 3;

const EXIT_TRUE = true;
const EXIT_FALSE = false;

const toWei = (number) => web3.utils.toWei(number.toString());
const fromWei = (x) => web3.utils.fromWei(x);
const addr0 = "0x0000000000000000000000000000000000000000";
const bytes0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ethBalance = (address) => web3.eth.getBalance(address);

module.exports = {
	timeController,
	wait,
	expect,
	toWei,
	fromWei,
	addr0,
	bytes0,
	ethBalance,

	TYPE_STAKE, TYPE_YIELD, TYPE_BOTH,
	EXIT_TRUE, EXIT_FALSE, 
}