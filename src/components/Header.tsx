import { FC, useContext } from "react";
import Link from "next/link";
import ConnectButton from "@/components/ConnectButton";
import UserContext from "@/contexts/usercontext";

const Header: FC = () => {
  const { tokeBalance } = useContext<any>(UserContext);

  return (
    <header className="w-full h-20 flex flex-row items-center border-b-[1px] border-[#26c3ff] shadow-xl shadow-[#193975]">
      <div className="container">
        <div className="flex items-center justify-between px-3">
          <Link href={"/"} className="">
            <div className=' font-semibold text-md xl:text-xl uppercase text-white'>
              SCAVENGER V1
            </div>
          </Link>
          <div className="flex flex-row items-center gap-4">
            <div className="text-[#26c3ff] text-lg flex flex-row gap-1 font-semibold" >{tokeBalance} $TOKE</div>
            <div className="flex items-center gap-2 ord-connect-font">
              <ConnectButton />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
