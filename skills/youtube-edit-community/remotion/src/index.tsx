import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Composition, continueRender, delayRender, registerRoot, staticFile, useCurrentFrame} from 'remotion';

type Props={settings:any;captions:any[];scenes:any[];headingSpans:any[];fps:number;frames:number};
const Overlay:React.FC<Props>=(p)=>{
 const frame=useCurrentFrame();const t=frame/p.fps;const s=p.settings;
 const [handle]=useState(()=>delayRender('同梱フォントの読み込み'));
 useEffect(()=>{Promise.all([document.fonts.load('800 56px "Caption"'),document.fonts.load('900 44px "Heading"')]).then(()=>continueRender(handle));},[handle]);
 const caption=p.captions.find(c=>Math.round(c.start*p.fps)<=frame&&frame<Math.round(c.end*p.fps));
 const imageScene=p.scenes.some(r=>r.view==='image'&&Math.round(r.start*p.fps)<=frame&&frame<Math.round(r.end*p.fps));
 const heading=p.headingSpans.find(h=>h.start_frame<=frame&&frame<h.end_frame);
 const u=heading?Math.min(1,(frame-heading.start_frame)/Math.max(1,s.heading.enter_s*p.fps)):0;
 const ease=1-Math.pow(1-u,4);
 const sx=s.output.width/1920, sy=s.output.height/1080;
 return <AbsoluteFill style={{backgroundColor:'transparent'}}>
  <style>{`@font-face{font-family:Caption;src:url('${staticFile(s.caption.font+'.ttf')}');font-weight:800;}@font-face{font-family:Heading;src:url('${staticFile('NotoSansJP-Black.ttf')}');font-weight:900;}`}</style>
  {caption&&<>
   {!imageScene&&<div style={{position:'absolute',left:0,right:0,bottom:0,height:250*sy,background:'linear-gradient(transparent,rgba(0,0,0,0.24))'}}/>}
   <div style={{position:'absolute',left:80*sx,right:80*sx,bottom:s.caption.bottom_px*sy,textAlign:'center',whiteSpace:'pre',fontFamily:'Caption',fontWeight:800,fontSize:s.caption.px*sx,lineHeight:1.4,color:s.caption.color,textShadow:s.caption.shadow==='soft'?'2px 2px 8px rgba(0,0,0,.88)':'none'}}>{caption.text}</div>
  </>}
  {heading&&<div style={{position:'absolute',left:s.heading.position==='right'?undefined:s.heading.left_px*sx,right:s.heading.position==='right'?s.heading.left_px*sx:undefined,top:s.heading.top_px*sy,transform:`translate(${((s.heading.position==='right'?800:-800)*(1-ease))*sx}px,${(-40*(1-ease))*sy}px) skewX(-9deg)`,opacity:ease,filter:`blur(${2*(1-ease)}px)`,background:s.heading.bg_color,padding:`${14*sy}px ${30*sx}px`,boxShadow:'0 4px 14px rgba(0,0,0,.16)',maxWidth:s.output.width-200*sx}}>
   <div style={{transform:'skewX(9deg)',fontFamily:'Heading',fontWeight:900,fontStyle:'italic',fontSize:s.heading.px*sx,color:s.heading.text_color,whiteSpace:'nowrap'}}>{heading.text}</div>
  </div>}
 </AbsoluteFill>;
};
const defaults:Props={settings:{output:{width:1920,height:1080},caption:{font:'NotoSansJP-ExtraBold'}},captions:[],scenes:[],headingSpans:[],fps:30,frames:1};
const Root=()=> <Composition id="Overlays" component={Overlay} width={1920} height={1080} fps={30} durationInFrames={1} defaultProps={defaults} calculateMetadata={({props})=>({width:props.settings.output.width,height:props.settings.output.height,fps:props.fps,durationInFrames:props.frames})}/>;
registerRoot(Root);
