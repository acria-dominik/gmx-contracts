const { readTmpAddresses, contractAt, callWithRetries, deployContract, sendTxn } = require("../shared/helpers")
const { expandDecimals, maxUint256 } = require("../../test/shared/utilities")

async function main() {
	// const account = (await ethers.getSigners())[0]
	// const {BTC, ETH, USDC, USDT} = readTmpAddresses()

	// for (const tokenAddress of [BTC, USDC, USDT]) {
	// 	const amount = expandDecimals(100000, 18)
	// 	console.log(`Minting ${amount} of tokens ${tokenAddress}`)
	// 	const tokenContract = await contractAt("FaucetToken", tokenAddress)
	// 	await callWithRetries(tokenContract.mint.bind(tokenContract), [account.address, amount])
	// }

	// for (const tokenAddress of ['0x961277cf5C3234667551B85F56D3A059D5088Ac4', '0xD7cCA552df515452403eBd47c4B518E635f5e10A', '0xB9F8D3ed91C9010F8CC8d17CaFD8898FB65c793A']) {
		// const amount = expandDecimals(120000, 18)
	// 	console.log(`Minting ${amount} of tokens ${tokenAddress}`)
	// 	const tokenContract = await contractAt("FaucetToken", tokenAddress)
	// 	await callWithRetries(tokenContract.mint.bind(tokenContract), ['0x7d9D31E730b794B2f5F74c621cb056A68a6e2825', amount])
	// }



  // const weth = await contractAt("FaucetToken", "0xefAB0Beb0A557E452b398035eA964948c750b2Fd")
  // await weth.mint("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", 12000000)

  const glpManager = await contractAt("GlpManager", "0x045857BDEAE7C1c7252d611eB24eB55564198b4C")
  await glpManager.setInPrivateMode(false)
  const btc = await contractAt("FaucetToken", "0xFD6F7A6a5c21A3f503EBaE7a473639974379c351")
  await btc.approve(glpManager.address, maxUint256)
  await glpManager.addLiquidity("0xFD6F7A6a5c21A3f503EBaE7a473639974379c351", expandDecimals(1, 8), expandDecimals(1, 18), expandDecimals(1, 18))



  // const vault = await contractAt("Vault", "0x7d9D31E730b794B2f5F74c621cb056A68a6e2825")
  // console.log(await vault.priceFeed());
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())

  // const wethPriceFeed = await deployContract("PriceFeed", [])
  // await vaultPriceFeed.setTokenConfig("0x4E145e062F48Ead1429060ce677c7629de85c165", wethPriceFeed.address, 8, false)

  // const btcPriceFeed = await deployContract("PriceFeed", [])
  // await vaultPriceFeed.setTokenConfig("0x961277cf5C3234667551B85F56D3A059D5088Ac4", btcPriceFeed.address, 8, false)

  // const ethPriceFeed = await deployContract("PriceFeed", [])
  // await vaultPriceFeed.setTokenConfig("0x0000000000000000000000000000000000000000", ethPriceFeed.address, 8, false)

  // const usdcPriceFeed = await deployContract("PriceFeed", [])
  // await vaultPriceFeed.setTokenConfig("0xD7cCA552df515452403eBd47c4B518E635f5e10A", usdcPriceFeed.address, 8, false)

  // const usdtPriceFeed = await deployContract("PriceFeed", [])
  // await vaultPriceFeed.setTokenConfig("0xB9F8D3ed91C9010F8CC8d17CaFD8898FB65c793A", usdtPriceFeed.address, 8, false)
}

main()
