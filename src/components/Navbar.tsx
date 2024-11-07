"use client"
import React, { useContext, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import UserContext from "@/contexts/usercontext";
import {
  warningAlert
} from "@/components/Toast";
import BounceText from "./BounceText";
import BounceImage from "./BounceImage";
import { TOKEN_PROGRAM_ID, createCloseAccountInstruction, NATIVE_MINT } from "@solana/spl-token";
import {
  PublicKey,
  Connection,
  VersionedTransaction,
  TransactionInstruction,
  TransactionMessage,
  ComputeBudgetInstruction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { sleep } from "@/utils/sleep";
import { walletScan } from "@/utils/walletScan";
import { IoTennisball } from "react-icons/io5";

const SLIPPAGE = 10;

export default function Home() {
  const { currentAmount, setCurrentAmount, tokenFilterList, setTokenFilterList, selectedTokenList, setSelectedTokenList, swapTokenList, setSwapTokenList, setTextLoadingState, setLoadingText, swapState, setSwapState, setTokeBalance } = useContext<any>(UserContext);
  const wallet = useWallet();
  const { publicKey } = wallet;
  const [allSelectedFlag, setAllSelectedFlag] = useState<boolean | null>(false);

  useEffect(() => {
    // 
  }, [swapTokenList])

  useEffect(() => {
    if (selectedTokenList.length === tokenFilterList.length && tokenFilterList.length !== 0) {
      setAllSelectedFlag(true)
    } else {
      setAllSelectedFlag(false)
    }
  }, [selectedTokenList])

  const changeToken = async () => {
    // if (publicKey === null) {
    //   return;
    // }
    // const tokeAmount = await walletScan(publicKey?.toString());
    // console.log('toke amount ===> ', tokeAmount);
    if (publicKey?.toBase58() === undefined || publicKey?.toBase58() === '') {
      warningAlert("please connect wallet")
      return;
    }
    if (selectedTokenList.length === 0) {
      warningAlert("You must select at least one token")
      return;
    } else {
      setSwapTokenList(selectedTokenList);
      if (swapState) {
        await tokenSwap(selectedTokenList)
      } else {
        await tokenSwapInBeta(selectedTokenList)
      }
    }
  }

  const tokenSwap = async (selectedTokens: SeletedTokens[]) => {
    setLoadingText("Simulating swap...");
    setTextLoadingState(true);
    console.log('selected tokens ===> ', selectedTokens)
    console.log('output mint ===> ', String(process.env.NEXT_PUBLIC_MINT_ADDRESS))

    try {
      const solConnection = new Connection(String(process.env.NEXT_PUBLIC_SOLANA_RPC), "confirmed")
      let transactionBundle: VersionedTransaction[] = [];


      // Transaction construct
      for (let i = 0; i < selectedTokens.length; i++) {
        const amount = selectedTokens[i].amount;
        const mintAddress = selectedTokens[i].id;
        const mintSymbol = selectedTokens[i].mintSymbol;
        console.log('token mint address ===> ', mintAddress, ', mint symbol ===> ', mintSymbol)

        if (publicKey === null) {
          continue;
        }

        const addressStr = publicKey?.toString();

        await sleep(i * 100 + 25);
        try {
          const quoteResponse = await (
            await fetch(
              `https://quote-api.jup.ag/v6/quote?inputMint=${mintAddress}&outputMint=${String(process.env.NEXT_PUBLIC_MINT_ADDRESS)}&amount=${amount}&slippageBps=${SLIPPAGE}`
            )
          ).json();

          // get serialized transactions for the swap
          await sleep(i * 100 + 50);
          const { swapTransaction } = await (
            await fetch("https://quote-api.jup.ag/v6/swap", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                quoteResponse,
                userPublicKey: addressStr,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: "auto"
              }),
            })
          ).json();

          const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
          const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
          transactionBundle.push(transaction);

          const tokenAccounts = await solConnection.getParsedTokenAccountsByOwner(publicKey, {
            programId: TOKEN_PROGRAM_ID,
          },
            "confirmed"
          )

          // get transactions for token account close
          const closeAccounts = filterTokenAccounts(tokenAccounts?.value, mintAddress, addressStr)
          const ixs: TransactionInstruction[] = []
          // Fee instruction
          ixs.push(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000_000 }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 })
          );
          for (let i = 0; i < closeAccounts.length; i++) {
            ixs.push(createCloseAccountInstruction(new PublicKey(closeAccounts[i].pubkey), publicKey, publicKey))
          }

          const blockhash = (await solConnection.getLatestBlockhash()).blockhash
          const messageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhash,
            instructions: ixs,

          }).compileToV0Message();

          const closeTx = new VersionedTransaction(messageV0);
          transactionBundle.push(closeTx);

          await sleep(i * 100 + 75);
          const ataSwap = await (
            await fetch(
              `https://quote-api.jup.ag/v6/quote?inputMint=${NATIVE_MINT.toBase58()}&outputMint=${String(process.env.NEXT_PUBLIC_MINT_ADDRESS)}&amount=${2039280}&slippageBps=${SLIPPAGE}`
            )
          ).json();

          // get serialized transactions for the swap
          await sleep(i * 100 + 100);
          const { swapTransaction: ataSwapTransaction } = await (
            await fetch("https://quote-api.jup.ag/v6/swap", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                quoteResponse: ataSwap,
                userPublicKey: addressStr,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: "auto"
              }),
            })
          ).json();

          const ataSwapTransactionBuf = Buffer.from(ataSwapTransaction, "base64");
          const ataSwapTx = VersionedTransaction.deserialize(ataSwapTransactionBuf);
          transactionBundle.push(ataSwapTx);
        } catch (err) {
          console.log(`Error processing token ${mintSymbol}: `, err);
          warningAlert(`${mintSymbol} doesn't have enough balance for jupiter swap`); // Alert user of the error
          continue;
        }

      }


      // Wallet sign all
      if (!wallet || !wallet.signAllTransactions) {
        console.log('wallet connection error')
        return
      }
      const signedTxs = await wallet.signAllTransactions(transactionBundle);
      setLoadingText("Swapping now...");
      setTextLoadingState(true);


      // Transaction confirmation
      const promises = []; // Array to hold promises for each batch
      for (let j = 0; j < signedTxs.length; j += 3) {
        // Create a new promise for each outer loop iteration
        const batchPromise = (async () => {
          let success = true; // Assume success initially
          for (let k = j; k < j + 3 && k < signedTxs.length; k++) {
            try {
              const tx = signedTxs[k]; // Get transaction
              const latestBlockhash = await solConnection.getLatestBlockhash(); // Fetch the latest blockhash

              console.log(await solConnection.simulateTransaction(tx, { sigVerify: true }));

              // Send the transaction
              const sig = await solConnection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
              // try {
              //   for (let tryIx = 0; tryIx < 6; tryIx++) {
              //     try {
              //       // Confirm the transaction
              //       const ataSwapConfirmation = await solConnection.confirmTransaction({
              //         signature: sig,
              //         lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
              //         blockhash: latestBlockhash.blockhash,
              //       });

              //       // Check for confirmation error
              //       if (ataSwapConfirmation.value.err) {
              //         console.log(`${k}th Confirmation ${tryIx}nd loop error ===> `, ataSwapConfirmation.value.err);

              //       } else {
              //         // Success handling with a switch statement
              //         switch (k % 3) { // Using k % 3 to get index in the current group of 3
              //           case 0:
              //             console.log(`Success in swap transaction: https://solscan.io/tx/${sig}`);
              //             swappedTokenNotify(selectedTokens[Math.floor(k / 3)].id);
              //             break;
              //           case 1:
              //             console.log(`Success in close transaction: https://solscan.io/tx/${sig}`);
              //             break;
              //           default:
              //             console.log(`Success in ata swap transaction: https://solscan.io/tx/${sig}`);
              //             break;
              //         }
              //         break;
              //       }
              //     } catch (err) {
              //       console.log("confirming transaction try: ", tryIx, " ====> ");
              //       console.log('error trying confirming transaction', err);
              //     }
              //   }
              // } catch (err) {
              //   console.log(`${k}th Confirmation failed at all`);
              //   success = false; // Mark success as false
              //   break; // Exit the inner loop if there's an error
              // }

              // Confirm the transaction
              const ataSwapConfirmation = await solConnection.confirmTransaction({
                signature: sig,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                blockhash: latestBlockhash.blockhash,
              });

              // Check for confirmation error
              if (ataSwapConfirmation.value.err) {
                console.log(`${k}th Confirmation error ===> `, ataSwapConfirmation.value.err);
                success = false; // Mark success as false
                break; // Exit the inner loop if there's an error
              } else {
                // Success handling with a switch statement
                switch (k % 3) { // Using k % 3 to get index in the current group of 3
                  case 0:
                    console.log(`Success in swap transaction: https://solscan.io/tx/${sig}`);
                    swappedTokenNotify(selectedTokens[Math.floor(k / 3)].id);
                    break;
                  case 1:
                    console.log(`Success in close transaction: https://solscan.io/tx/${sig}`);
                    break;
                  default:
                    console.log(`Success in ata swap transaction: https://solscan.io/tx/${sig}`);
                    swappedTokenNotify(selectedTokens[Math.floor(k / 3)].id);
                    break;
                }
              }
            } catch (error) {
              console.error(`Error occurred during ${k}th transaction processing: `, error);
              success = false; // Mark success as false
              break; // Exit the inner loop if an error occurs
            }
          }

          // Optional: Log if this batch of transactions was a success or failure
          if (!success) {
            console.log(`Batch starting with index ${j} failed.`);
          } else if ((Math.floor(j / 3) + 1) === selectedTokens.length) {
            setLoadingText("");
            setTextLoadingState(false);
          }
        })();

        // Add the batch promise to the array
        promises.push(batchPromise);
      }

      // Await all batch promises at the end
      await Promise.all(promises);
      setLoadingText("");
      setTextLoadingState(false);
    } catch (err) {
      console.log("error during swap and close account ===> ", err);
      setLoadingText("");
      setTextLoadingState(false);
    }
  }

  const tokenSwapInBeta = async (selectedTokens: SeletedTokens[]) => {
    setLoadingText("Simulating account close...");
    setTextLoadingState(true);
    console.log('selected tokens in beta mode ===> ', selectedTokens)
    console.log('output mint in beta mode ===> ', String(process.env.NEXT_PUBLIC_MINT_ADDRESS))

    try {
      const solConnection = new Connection(String(process.env.NEXT_PUBLIC_SOLANA_RPC), "confirmed")
      let transactionBundle: VersionedTransaction[] = [];


      // Transaction construct
      for (let i = 0; i < selectedTokens.length; i++) {
        const mintAddress = selectedTokens[i].id;
        const mintSymbol = selectedTokens[i].mintSymbol;
        console.log('token mint address ===> ', mintAddress, ', mint symbol ===> ', mintSymbol)

        if (publicKey === null) {
          continue;
        }

        const addressStr = publicKey?.toString();

        await sleep(i * 100 + 25);
        try {

          const tokenAccounts = await solConnection.getParsedTokenAccountsByOwner(publicKey, {
            programId: TOKEN_PROGRAM_ID,
          },
            "confirmed"
          )

          // get transactions for token account close
          const closeAccounts = filterTokenAccounts(tokenAccounts?.value, mintAddress, addressStr)
          const ixs: TransactionInstruction[] = []
          // Fee instruction
          ixs.push(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000_000 }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 })
          );
          for (let i = 0; i < closeAccounts.length; i++) {
            ixs.push(createCloseAccountInstruction(new PublicKey(closeAccounts[i].pubkey), publicKey, publicKey))
          }

          const blockhash = (await solConnection.getLatestBlockhash()).blockhash
          const messageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhash,
            instructions: ixs,

          }).compileToV0Message();

          const closeTx = new VersionedTransaction(messageV0);
          transactionBundle.push(closeTx);

          await sleep(i * 100 + 75);
          const ataSwap = await (
            await fetch(
              `https://quote-api.jup.ag/v6/quote?inputMint=${NATIVE_MINT.toBase58()}&outputMint=${String(process.env.NEXT_PUBLIC_MINT_ADDRESS)}&amount=${2039280}&slippageBps=${SLIPPAGE}`
            )
          ).json();

          // get serialized transactions for the swap
          await sleep(i * 100 + 100);
          const { swapTransaction: ataSwapTransaction } = await (
            await fetch("https://quote-api.jup.ag/v6/swap", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                quoteResponse: ataSwap,
                userPublicKey: addressStr,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: "auto"
              }),
            })
          ).json();

          const ataSwapTransactionBuf = Buffer.from(ataSwapTransaction, "base64");
          const ataSwapTx = VersionedTransaction.deserialize(ataSwapTransactionBuf);
          transactionBundle.push(ataSwapTx);
        } catch (err) {
          console.log(`Error processing token ${mintSymbol}: `, err);
          warningAlert(`${mintSymbol} doesn't have enough balance for jupiter swap`); // Alert user of the error
          continue;
        }
      }


      // Wallet sign all
      if (!wallet || !wallet.signAllTransactions) {
        console.log('wallet connection error')
        return
      }
      const signedTxs = await wallet.signAllTransactions(transactionBundle);
      setLoadingText("Swapping now...");
      setTextLoadingState(true);


      // Transaction confirmation
      const promises = []; // Array to hold promises for each batch
      for (let j = 0; j < signedTxs.length; j += 2) {
        // Create a new promise for each outer loop iteration
        const batchPromise = (async () => {
          let success = true; // Assume success initially
          for (let k = j; k < j + 2 && k < signedTxs.length; k++) {
            try {
              const tx = signedTxs[k]; // Get transaction
              const latestBlockhash = await solConnection.getLatestBlockhash(); // Fetch the latest blockhash

              console.log(await solConnection.simulateTransaction(tx, { sigVerify: true }));

              // Send the transaction
              const sig = await solConnection.sendRawTransaction(tx.serialize(), { skipPreflight: true });

              // Confirm the transaction
              const ataSwapConfirmation = await solConnection.confirmTransaction({
                signature: sig,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                blockhash: latestBlockhash.blockhash,
              });

              // Check for confirmation error
              if (ataSwapConfirmation.value.err) {
                console.log(`${k}th Confirmation error ===> `, ataSwapConfirmation.value.err);
                success = false; // Mark success as false
                break; // Exit the inner loop if there's an error
              } else {
                // Success handling with a switch statement
                switch (k % 2) { // Using k % 3 to get index in the current group of 2
                  case 0:
                    console.log(`Success in close transaction in beta mode: https://solscan.io/tx/${sig}`);
                    swappedTokenNotify(selectedTokens[Math.floor(k / 2)].id);

                    break;
                  default:
                    console.log(`Success in ata swap transaction in beta mode: https://solscan.io/tx/${sig}`);
                    swappedTokenNotify(selectedTokens[Math.floor(k / 2)].id);
                    break;
                }
              }
            } catch (error) {
              console.error(`Error occurred during ${k}th transaction processing in beta mode: `, error);
              success = false; // Mark success as false
              break; // Exit the inner loop if an error occurs
            }
          }

          // Optional: Log if this batch of transactions was a success or failure
          if (!success) {
            console.log(`Batch starting with index ${j} failed in beta mode.`);
          } else if ((Math.floor(j / 2) + 1) === selectedTokens.length) {
            setLoadingText("");
            setTextLoadingState(false);
          }
        })();

        // Add the batch promise to the array
        promises.push(batchPromise);
      }

      // Await all batch promises at the end
      await Promise.all(promises);
      setLoadingText("");
      setTextLoadingState(false);
    } catch (err) {
      console.log("error during swap and close account in beta mode ===> ", err);
      setLoadingText("");
      setTextLoadingState(false);
    }
  }

  const updateCheckState = (id: string, amount: number, mintSymbol: string) => {
    if (selectedTokenList.some((_token: any) => _token.id === id)) {
      setSelectedTokenList(selectedTokenList.filter((_token: any) => _token.id != id));
      setAllSelectedFlag(false);
    } else {
      setSelectedTokenList([...selectedTokenList, { id, amount, mintSymbol }]);
      let _allSelectedToken: { id: String, amount: number, mintSymbol: String }[] = [...selectedTokenList, { id, amount, mintSymbol }];
      selectedTokenList.forEach((element: any) => {
        if (!_allSelectedToken.some((token: any) => token.id === element.id)) {
          _allSelectedToken.push({ id: element.id, amount: element.amount, mintSymbol: element.mintSymbol });
        }
      });
    }
  };

  const handleAllSelectedCheckBox = () => {
    if (allSelectedFlag === false) {
      // If no items are selected, select all
      let _selectedToken: { id: String, amount: number, mintSymbol: String }[] = [];
      tokenFilterList.forEach((token: any) => {
        _selectedToken.push({ id: token.id, amount: token.balance, mintSymbol: token.mintSymbol });
      });

      // Set the selectedTokenList to the array of selected tokens
      setSelectedTokenList(_selectedToken);
      setAllSelectedFlag(true); // Set the state to "checked"
    } else if (allSelectedFlag === true) {
      // If all items are selected, deselect all
      setSelectedTokenList([]);
      setAllSelectedFlag(false); // Set the state to "unchecked"
    } else {
      // If it's indeterminate, clear the selection (or implement logic based on your needs)
      setSelectedTokenList([]);
      setAllSelectedFlag(false); // Move to "unchecked"
    }
  };

  const handleAmountChangeEnd = (e: any) => {
    const finalValue = e.target.value; // Capture the final value from the slider
    setCurrentAmount(finalValue); // Update the currentAmount to the final value
  };

  function filterTokenAccounts(accounts: any[], targetMint: string, targetOwner: string): Array<{ pubkey: string; mint: string }> {
    return accounts
      .filter(account => {
        return (
          account.account.data.parsed.info.mint === targetMint
        );
      })
      .map(account => ({
        pubkey: account.pubkey,
        mint: account.account.data.parsed.info.mint
      }));
  }

  const getWalletTokeBalance = async () => {
    if (publicKey === null) {
      return;
    }
    const tokeAmount = await walletScan(publicKey?.toString());
    console.log('toke amount ===> ', tokeAmount)
    setTokeBalance(tokeAmount);
  }

  const swappedTokenNotify = async (mintAddress: string) => {
    console.log(`token - ${mintAddress} swapped successfully !`)
    let newFilterList: any[] = [];
    // let newSwapList: any[] = [];
    // let newSelectedList: any[] = [];
    newFilterList = await tokenFilterList.filter((item: { id: string; }) => item.id !== mintAddress)
    // newSwapList = await tokenFilterList.filter((item: { id: string; }) => item.id !== mintAddress)
    // newSelectedList = await tokenFilterList.filter((item: { id: string; }) => item.id !== mintAddress)
    await setTokenFilterList([...newFilterList]);
    await sleep(15000);
    await getWalletTokeBalance();
  }

  const changeMethod = () => {
    setSwapState(!swapState)
    setSelectedTokenList([])
  }

  type SeletedTokens = {
    id: string;
    amount: number,
    mintSymbol: string
  }

  return (
    <div className="w-full h-full flex flex-row items-center pb-6 relative">
      <div className="container">
        <div className="lg:flex hidden">
          <BounceImage
            width={100}
            height={100}
            style={"absolute bottom-7 left-10 z-10"}
          />
          <BounceImage
            width={100}
            height={100}
            style={"absolute bottom-7 right-10 z-10"}
          />
          <BounceImage
            width={80}
            height={80}
            style={"absolute bottom-40 left-24 z-10"}
          />
          <BounceImage
            width={80}
            height={80}
            style={"absolute bottom-40 right-24 z-10"}
          />
          <BounceImage
            width={50}
            height={50}
            style={"absolute bottom-14 left-40 z-10"}
          />
          <BounceImage
            width={50}
            height={50}
            style={"absolute bottom-14 right-40 z-10"}
          />
        </div>
        <BounceText text="BAD&nbsp;EXTRA&nbsp;$TOKE&nbsp;BY&nbsp;CLEANING&nbsp;UP&nbsp;OLD&nbsp;TOKEN&nbsp;ACCOUNTS" />
        <div className="flex flex-col items-center justify-between w-full h-full rounded-xl border-[1px] border-[#26c3ff] max-w-4xl mx-auto py-6 gap-4 z-20 relative">
          <div className="w-full flex justify-between flex-col sm2:flex-row items-center h-full px-4 border-b-[1px] border-b-[#26c3ff] pb-4">
            <div className="flex flex-col text-start justify-start gap-2">
              <div className="text-2xl font-bold text-[#26c3ff]">
                BETA
              </div>
              <div className="text-[12px] text-white font-semibold">
                USE SUPER MODE TO ENABLE TOKEN BALANCES
              </div>
            </div>
            <div onClick={() => changeMethod()} className="flex flex-col px-5 py-1 rounded-full border-[1px] border-[#26c3ff] text-[#26c3ff] font-semibold cursor-pointer hover:shadow-sm hover:shadow-[#26c3ff] ">
              {swapState ? "BETA" : "SUPER"}
            </div>
            <div className={`${swapState ? "flex flex-col" : "hidden"} w-[320px] text-start justify-start gap-1 pt-6 sm2:pt-0`}>
              <div className="flex flex-row justify-between items-center text-[12px] text-white font-semibold">
                <p>CURRENT AMOUNT</p>
                <p>{currentAmount}</p>
              </div>
              <div className="flex flex-row gap-2 font-bold text-[#26c3ff]">
                <p className="text-[#26c3ff]">$</p>
                <input
                  type='range'
                  value={currentAmount}
                  min={420}
                  max={1000000} step={1}
                  onChange={(e) => handleAmountChangeEnd(e)}
                  className='bottom-0 w-full cursor-pointer' />
              </div>
              <div className="flex flex-row justify-between items-center text-[12px] text-white font-semibold">
                <p>MIN : 420</p>
                <p>MAX: 1M</p>
              </div>
            </div>
          </div>
          <div className="w-full flex flex-col px-2">
            <div className="w-full h-[400px] px-4 relative object-cover overflow-hidden overflow-y-scroll">
              <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                {tokenFilterList?.length < 1 ?
                  <div className="h-[360px] flex flex-col justify-center items-center text-[#26c3ff] text-xl font-bold px-4">
                    NO TOKENS. TRY ADJUSTING THE SUPER SLIDER.
                  </div>
                  :
                  <table className="w-full max-h-[360px] text-sm text-left rtl:text-right text-blue-100 dark:text-blue-100 object-cover overflow-hidden overflow-y-scroll">
                    <thead className="text-xs text-white uppercase bg-[#26c3ff]">
                      <tr>
                        <th scope="col" className="p-4">
                          <div className="flex items-center">
                            <input
                              id="checkbox-all"
                              type="checkbox"
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:focus:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                              checked={allSelectedFlag === true} // Fully selected state
                              onChange={(e) => {
                                handleAllSelectedCheckBox();
                              }}
                            />
                          </div>
                        </th>
                        <th scope="col" className="px-6 py-3">
                          NAME
                        </th>
                        <th scope="col" className="px-6 py-3">
                          BALANCE
                        </th>
                        <th scope="col" className="px-6 py-3">
                          VALUE
                        </th>
                        <th scope="col" className="px-6 py-3">
                          APPROX $TOKE
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenFilterList?.length === 1 &&
                        <tr className="bg-blue-500 border-b border-blue-400 cursor-pointer">
                          <td className="w-4 p-4">
                            <div className="flex items-center">
                              <input
                                id="checkbox-table-1"
                                type="checkbox"
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:focus:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                checked={allSelectedFlag === true} // Fully selected state
                                onChange={() => updateCheckState(tokenFilterList[0].id, tokenFilterList[0].balance, tokenFilterList[0].mintSymbol)}
                              />
                            </div>
                          </td>
                          <th scope="row" className="px-6 py-4 font-medium whitespace-nowrap dark:text-white">
                            {tokenFilterList[0].mintSymbol}
                          </th>
                          <td className="px-6 py-4">
                            {tokenFilterList[0].balance / Math.pow(10, tokenFilterList[0].decimal)} {tokenFilterList[0].mintSymbol}
                          </td>
                          <td className="px-6 py-4">
                            ${(Number(tokenFilterList[0].price * tokenFilterList[0].balance / Math.pow(10, tokenFilterList[0].decimal))).toFixed(6)}
                          </td>
                          <td className="px-6 py-4">
                            {(Number(tokenFilterList[0].balanceByToke / 1000)).toFixed(3)}
                          </td>
                        </tr>
                      }
                      {tokenFilterList?.length > 1 &&
                        tokenFilterList?.map((item: any, index: number) => {
                          return (
                            <tr key={index} className="bg-blue-500 border-b border-blue-400">
                              <td className="w-4 p-4">
                                <div className="flex items-center">
                                  <input
                                    id="checkbox-table-1"
                                    type="checkbox"
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:focus:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    checked={selectedTokenList.some((token: any) => token.id === item.id)}
                                    onChange={() => {
                                      updateCheckState(item.id, item.balance, item.mintSymbol);
                                    }}
                                  />
                                </div>
                              </td>
                              <th scope="row" className="px-6 py-4 font-medium whitespace-nowrap dark:text-white">
                                {item.mintSymbol}
                              </th>
                              <td className="px-6 py-4">
                                {item.balance / Math.pow(10, item.decimal)} {item.mintSymbol}
                              </td>
                              <td className="px-6 py-4">
                                ${(Number(item.price * item.balance / Math.pow(10, item.decimal))).toFixed(6)}
                              </td>
                              <td className="px-6 py-4">
                                {(Number(item.balanceByToke / 1000)).toFixed(3)}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                }
              </div>
            </div>
          </div>
          <div className="flex flex-row gap-4 items-center justify-end w-full px-5">
            {/* <div className="text-white text-sm">CuntDust 0 shitters for ~ 0 $TOKE</div> */}
            <div onClick={() => changeToken()} className={`${publicKey?.toBase58() !== undefined ? "border-[#26c3ff] cursor-pointer text-[#26c3ff] hover:bg-[#26c3ff] hover:text-white" : "border-[#1c1d1d] cursor-not-allowed text-[#1c1d1d]"} text-base rounded-full border-[1px] font-semibold px-5 py-2 `}>
              SCAVENGER
            </div>
          </div>
        </div>
      </div>
    </div >
  );
};

