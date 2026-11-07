import { referenceRoot } from './reference-paths.mjs'
import {createRequire} from 'node:module'
const core=referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require=createRequire(core+'/package.json')
const {outputFiles}=await require('esbuild').build({
  stdin:{resolveDir:core,sourcefile:'native-timestamp-fixture.tsx',loader:'tsx',contents:`
import React from 'react';import{renderToStaticMarkup}from'react-dom/server';
import{TimelineTimestamp}from'./apps/desktop/src/components/assistant-ui/thread/timeline-timestamp';
import{$displayTimestamps}from'@/store/display-timestamps';
window.timestampMarkup=(timestamp,completedAt,enabled=true)=>{ $displayTimestamps.set(enabled);return renderToStaticMarkup(React.createElement(TimelineTimestamp,{timestamp,completedAt})) };
`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
  tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},
  plugins:[{name:'timestamp-provider-boundaries',setup(build){
    build.onResolve({filter:/^@\/store\/display-timestamps$/},()=>({path:'setting',namespace:'fixture'}))
    build.onResolve({filter:/^@assistant-ui\/react$/},()=>({path:'unused-message-context',namespace:'fixture'}))
    build.onLoad({filter:/^setting$/,namespace:'fixture'},()=>({contents:'import {atom} from "nanostores";export const $displayTimestamps=atom(true);',resolveDir:core}))
    build.onLoad({filter:/^unused-message-context$/,namespace:'fixture'},()=>({contents:'export const useAuiState=()=>{throw Error("Unexpected message context")};'}))
  }}]
})
export const nativeTimestampBundle=outputFiles[0].text
