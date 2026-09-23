import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Connection,PublicKey} from '@solana/web3.js';
import {AccountLayout} from '@solana/spl-token';
import {program as jupiterProgram} from '@jup-ag/instruction-parser';
import {DynamicBondingCurveClient,deriveDbcPoolAddress} from '@meteora-ag/dynamic-bonding-curve-sdk';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let server:Server,connection:Connection;
const requests:{id:unknown;method:string;params:unknown[]}[]=[];
beforeAll(async()=>{
 server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const request=JSON.parse(body) as typeof requests[number];requests.push(request);
  const result=request.method==='getBalance'?{context:{slot:777},value:123456789}:request.method==='getSlot'?777:request.method==='getLatestBlockhash'?{context:{slot:777},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:999}}:undefined;
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result===undefined?{jsonrpc:'2.0',id:request.id,error:{code:-32000,message:'controlled RPC failure'}}:{jsonrpc:'2.0',id:request.id,result}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 connection=new Connection(`http://127.0.0.1:${(server.address() as AddressInfo).port}`,'finalized');
});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
describe('Production dependency compatibility',()=>{
 it('runs actual web3 Connection requests and errors through the upgraded Jayson transport',async()=>{
  expect(await connection.getBalance(new PublicKey('11111111111111111111111111111111'))).toBe(123456789);
  expect(await connection.getSlot()).toBe(777);
  expect(await connection.getLatestBlockhash()).toEqual({blockhash:'11111111111111111111111111111111',lastValidBlockHeight:999});
  await expect(connection.getBlockHeight()).rejects.toThrow('controlled RPC failure');
  expect(requests.map(request=>request.method)).toEqual(['getBalance','getSlot','getLatestBlockhash','getBlockHeight']);
  expect(new Set(requests.map(request=>request.id)).size).toBe(4);
  expect(requests.every(request=>typeof request.id==='string')).toBe(true);
 });
 it('loads the existing Jupiter/Meteora APIs and keeps exact fixed-width SPL integer decoding',()=>{
  expect(typeof (jupiterProgram.coder.instruction as unknown as {decode?:unknown}).decode).toBe('function');
  expect(typeof DynamicBondingCurveClient).toBe('function');expect(typeof deriveDbcPoolAddress).toBe('function');
  const account=Buffer.alloc(165),amount=(1n<<63n)+1n;account.writeBigUInt64LE(amount,64);
  expect(AccountLayout.decode(account).amount).toBe(amount);
 });
 it('retains Anchor-compatible CommonJS TOML Buffer parsing with the patched parser',()=>{
  const toml=require('toml');
  expect(toml.parse(Buffer.from('[provider]\ncluster="devnet"\nwallet="local-test.json"\n'))).toEqual({provider:{cluster:'devnet',wallet:'local-test.json'}});
  expect(require('toml/package.json').version).toBe('4.2.0');
  expect(require('jayson/package.json').version).toBe('5.0.0');
 });
});
