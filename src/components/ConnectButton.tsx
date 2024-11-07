"use client";
import axios from "axios";
import { FC, useContext, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ArrowLine, ExitIcon, WalletIcon } from "./SvgIcon";
import { walletScan } from "@/utils/walletScan";
import UserContext from "@/contexts/usercontext";
import {
  errorAlert
} from "@/components/Toast";

const ConnectButton: FC = () => {
  const { tokenList, setTokenList, setLoadingState, currentAmount, setTokenFilterList, setTokeBalance, swapState } = useContext<any>(UserContext);
  const { setVisible } = useWalletModal();
  const { publicKey, disconnect } = useWallet();

  useEffect(() => {
    if (publicKey?.toBase58() !== "" && publicKey?.toBase58() !== undefined) {
      if (swapState) {
        getTokenList(publicKey.toBase58());
      } else {
        getTokenListInBeta(publicKey.toBase58());
      }
      getWalletTokeBalance();
    }
  }, [publicKey, swapState])

  useEffect(() => {
    if (tokenList !== undefined) {
      filterData()
    }
  }, [tokenList, currentAmount])

  const getTokenList = async (address: string) => {
    setLoadingState(true)
    console.log('/getTokenList url calling ... ')
    try {
      const response = await axios.post('https://api.scavenger.mctoken.xyz/getTokens', { walletAddress: address });
      setTokenList(response.data.data)
    } catch (err) {
      console.log("ERROR : ", err)
      errorAlert(err)
    }
    setLoadingState(false)
  }

  const getTokenListInBeta = async (address: string) => {
    setLoadingState(true)
    console.log('/getTokenListInBeta url calling ... ')
    try {
      const response = await axios.post('https://api.scavenger.mctoken.xyz/getTokensInBeta', { walletAddress: address });
      setTokenList(response.data.data)
    } catch (err) {
      console.log("ERROR : ", err)
      errorAlert(err)
    }
    setLoadingState(false)
  }

  const getWalletTokeBalance = async () => {
    if (publicKey === null) {
      return;
    }
    const tokeAmount = await walletScan(publicKey?.toString());
    console.log('toke amount ===> ', tokeAmount)
    setTokeBalance(tokeAmount);
  }

  const filterData = async () => {
    const filteredData = await tokenList.filter((data: { balanceByToke: number; }) => (data.balanceByToke / 1000) <= currentAmount);
    setTokenFilterList(filteredData)
  }



  return (
    <div className="rounded-lg border-[0.75px] border-primary-300 bg-primary-200 shadow-btn-inner text-primary-100 tracking-[0.32px] py-2 px-2 w-[140px] lg:w-[180px] group relative cursor-pointer">
      {publicKey ? (
        <>
          <div className="flex items-center justify-center text-[12px] lg:text-[16px]">
            {publicKey.toBase58().slice(0, 4)}....
            {publicKey.toBase58().slice(-4)}
            <div className="rotate-90 w-3 h-3">
              <ArrowLine />
            </div>
          </div>
          <div className="w-[200px] absolute right-0 top-10 hidden group-hover:block">
            <ul className="border-[0.75px] border-[#89C7B5] rounded-lg bg-[#162923] p-2 mt-2">
              <li>
                <button
                  className="flex gap-2 items-center text-primary-100 tracking-[-0.32px]"
                  onClick={() => setVisible(true)}
                >
                  <WalletIcon /> Change Wallet
                </button>
              </li>
              <li>
                <button
                  className="flex gap-2 items-center text-primary-100 tracking-[-0.32px]"
                  onClick={disconnect}
                >
                  <ExitIcon /> Disconnect
                </button>
              </li>
            </ul>
          </div>
        </>
      ) : (
        <div
          className="flex items-center justify-center gap-1 text-[12px] lg:text-[16px]"
          onClick={() => setVisible(true)}
        >
          Connect wallet <ArrowLine />
        </div>
      )}
    </div>
  );
};

export default ConnectButton;
