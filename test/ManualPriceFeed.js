const { didContractThrow } = require("./utils/DidContractThrow.js");

const ManualPriceFeed = artifacts.require("ManualPriceFeed");
const BigNumber = require("bignumber.js");

contract("ManualPriceFeed", function(accounts) {

    // A deployed instance of the ManualPriceFeed contract, ready for testing.
    let manualPriceFeed;

    let owner = accounts[0];
    let rando = accounts[1];

    before(async function() {
        manualPriceFeed = await ManualPriceFeed.deployed();
    });

    it("No prices > One price > Updated price", async function() {
        const symbolBytes = web3.utils.hexToBytes(web3.utils.utf8ToHex("Symbol"));

        // No prices have been published, so the symbol is not yet supported.
        let supported = await manualPriceFeed.isSymbolSupported(symbolBytes);
        assert.equal(supported, false);

        // No prices have been published, so latest `publishTime` is 0.
        assert(
            await didContractThrow(manualPriceFeed.latestPrice(symbolBytes)));

        // Push a price at time=100, and the symbol should now be supported.
        await manualPriceFeed.pushLatestPrice(symbolBytes, 100, 500);
        supported = await manualPriceFeed.isSymbolSupported(symbolBytes);
        assert.equal(supported, true);

        // `latestPrice` should retrieve the price at time=100.
        actualPriceTick = await manualPriceFeed.latestPrice(symbolBytes);
        assert.equal(actualPriceTick.publishTime, 100);
        assert.equal(actualPriceTick.price, 500);

        // Push an updated price at time=200.
        await manualPriceFeed.pushLatestPrice(symbolBytes, 200, 1000);

        // `latestPrice` should retrieve the price at time=200.
        actualPriceTick = await manualPriceFeed.latestPrice(symbolBytes);
        assert.equal(actualPriceTick.publishTime, 200);
        assert.equal(actualPriceTick.price, 1000);
    });

    it("Multiple symbols", async function() {
        const firstSymbolBytes = web3.utils.hexToBytes(web3.utils.utf8ToHex("First"));
        const secondSymbolBytes = web3.utils.hexToBytes(web3.utils.utf8ToHex("Second"));
        const absentSymbolBytes = web3.utils.hexToBytes(web3.utils.utf8ToHex("Absent"));

        // Verify that all symbols start off unsupported.
        let firstSymbolSupported = await manualPriceFeed.isSymbolSupported(firstSymbolBytes);
        let secondSymbolSupported = await manualPriceFeed.isSymbolSupported(secondSymbolBytes);
        let absentSymbolSupported = await manualPriceFeed.isSymbolSupported(absentSymbolBytes);
        assert.equal(firstSymbolSupported, false);
        assert.equal(secondSymbolSupported, false);
        assert.equal(absentSymbolSupported, false);

        // And all latestPrice calls revert because these symbols are not supported.
        assert(
            await didContractThrow(manualPriceFeed.latestPrice(firstSymbolBytes)));
        assert(
            await didContractThrow(manualPriceFeed.latestPrice(secondSymbolBytes)));
        assert(
            await didContractThrow(manualPriceFeed.latestPrice(absentSymbolBytes)));

        // Push a price for the first symbol.
        await manualPriceFeed.pushLatestPrice(firstSymbolBytes, 100, 500);

        // Prices exist only for the first symbol.
        let firstSymbolPriceTick = await manualPriceFeed.latestPrice(firstSymbolBytes);
        assert.equal(firstSymbolPriceTick.publishTime, 100);
        assert.equal(firstSymbolPriceTick.price, 500);
        secondSymbolSupported = await manualPriceFeed.isSymbolSupported(secondSymbolBytes);
        absentSymbolSupported = await manualPriceFeed.isSymbolSupported(absentSymbolBytes);
        assert.equal(secondSymbolSupported, false);
        assert.equal(absentSymbolSupported, false);

        // Push a price for the second symbol.
        await manualPriceFeed.pushLatestPrice(secondSymbolBytes, 200, 1000);

        // Distinct prices exist for the two symbols, but the absentSymbol is still unsupported.
        firstSymbolPriceTick = await manualPriceFeed.latestPrice(firstSymbolBytes);
        let secondSymbolPriceTick = await manualPriceFeed.latestPrice(secondSymbolBytes);
        assert.equal(firstSymbolPriceTick.publishTime, 100);
        assert.equal(firstSymbolPriceTick.price, 500);
        assert.equal(secondSymbolPriceTick.publishTime, 200);
        assert.equal(secondSymbolPriceTick.price, 1000);
        absentSymbolSupported = await manualPriceFeed.isSymbolSupported(absentSymbolBytes);
        assert.equal(absentSymbolSupported, false);
    });

    it("Non owner", async function() {
        const symbolBytes = web3.utils.hexToBytes(web3.utils.utf8ToHex("Owned"));

        // Verify that the symbol is not supported yet.
        let supported = await manualPriceFeed.isSymbolSupported(symbolBytes, { from: rando });
        assert.equal(supported, false);

        // Non-owners can't push prices.
        assert(
            await didContractThrow(manualPriceFeed.pushLatestPrice(symbolBytes, 100, 500, { from: rando }))
        );

        await manualPriceFeed.pushLatestPrice(symbolBytes, 100, 500, { from: owner })

        // Verify that non-owners can still query prices.
        let priceTick = await manualPriceFeed.latestPrice(symbolBytes, { from: rando });
        assert.equal(priceTick.publishTime, 100);
        assert.equal(priceTick.price, 500);
    });

    it("Push non-consecutive prices", async function() {
        const symbolBytes = web3.utils.hexToBytes(web3.utils.utf8ToHex("Non-consecutive"));

        // Push an initial price.
        await manualPriceFeed.pushLatestPrice(symbolBytes, 100, 500);
        // Verify that a price earlier than the latest can't be pushed.
        assert(
            await didContractThrow(manualPriceFeed.pushLatestPrice(symbolBytes, 50, 500))
        );
    });

    it("Push a future price", async function() {
        const symbolBytes = web3.utils.hexToBytes(web3.utils.utf8ToHex("Future-price"));

        const tolerance = 900;
        const currentTime = 1000;
        await manualPriceFeed.setCurrentTime(currentTime);

        // Verify that a price later than the current time + tolerance can't be pushed.
        assert(
            await didContractThrow(manualPriceFeed.pushLatestPrice(symbolBytes, currentTime + tolerance + 1, 500))
        );

        // Verify that prices can be pushed within the tolerance.
        await manualPriceFeed.pushLatestPrice(symbolBytes, currentTime + tolerance, 500);
        let priceTick = await manualPriceFeed.latestPrice(symbolBytes);
        assert.equal(priceTick.publishTime, currentTime + tolerance);
        assert.equal(priceTick.price, 500);
    });
});
