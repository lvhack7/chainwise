import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { isAddress, parseUnits, getAddress } from 'viem';
import { networkName, type Network } from './networks.mts';
export type OpeningBasis={wallet:string;network:Network;priceUsdc:string;openingEth:string;startTradeId:string|null;asOfBlock:string;source:'user_reported';recordedAt:string};
export function decimal(value:unknown,decimals:number):value is string{
  return typeof value==='string'&&value.length<=80&&/^(0|[1-9]\d*)(\.\d+)?$/.test(value)&&(value.split('.')[1]?.length??0)<=decimals&&parseUnits(value,decimals)<2n**256n;
}
export function createCostBasisStore(root=new URL('./.cost-basis/',import.meta.url)){
  const path=(wallet:string,network:Network)=>{
    if(!isAddress(wallet))throw new Error('Invalid cost basis wallet');networkName(network);
    return new URL(createHash('sha256').update(network+':'+wallet.toLowerCase()).digest('hex')+'.json',root);
  };
  return {
    async read(wallet:string,network:Network):Promise<OpeningBasis|null>{
      try{
        const value=JSON.parse(await readFile(path(wallet,network),'utf8')) as OpeningBasis;
        if(value.wallet.toLowerCase()!==wallet.toLowerCase()||value.network!==network||value.source!=='user_reported'||!decimal(value.priceUsdc,8)||!decimal(value.openingEth,18))throw new Error('Invalid stored opening cost basis');
        return value;
      }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
    },
    async save(input:Omit<OpeningBasis,'source'|'recordedAt'>){
      if(!decimal(input.priceUsdc,8)||!decimal(input.openingEth,18)||!/^\d+$/.test(input.asOfBlock)||input.startTradeId!==null&&!/^[a-f0-9]{64}$/.test(input.startTradeId))throw new Error('Invalid opening cost basis');
      const file=path(input.wallet,input.network),temp=new URL(randomUUID()+'.tmp',root);
      const value:OpeningBasis={...input,wallet:getAddress(input.wallet),source:'user_reported',recordedAt:new Date().toISOString()};
      await mkdir(root,{recursive:true,mode:0o700});await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,file);return value;
    },
  };
}
export const costBasisStore=createCostBasisStore();
