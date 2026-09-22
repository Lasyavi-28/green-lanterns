(function(){
  const isTouch = matchMedia('(hover:none)').matches;

  /* ---------- custom cursor follower ---------- */
  const follow = document.getElementById('cursor-follow');
  let fx=0, fy=0, tx=0, ty=0;
  function raf(){
    fx += (tx-fx)*0.35; fy += (ty-fy)*0.35;
    follow.style.transform = `translate(${fx-8}px, ${fy-6}px)`;
    requestAnimationFrame(raf);
  }
  if(!isTouch){
    document.body.classList.add('cursor-active');
    document.addEventListener('mousemove', e=>{
      tx=e.clientX; ty=e.clientY; follow.style.opacity='1';
    });
    document.addEventListener('mouseleave', ()=> follow.style.opacity='0');
    raf();
  }

  /* ---------- shared: size a "stage" to its image's aspect ratio,
     wrapped in a horizontally-scrollable track so nothing gets cropped ---------- */
  function fitStage(scrollEl, stageEl, aspect){
    function resize(){
      const h = scrollEl.clientHeight;
      stageEl.style.width = Math.max(h*aspect, scrollEl.clientWidth) + 'px';
    }
    resize();
    new ResizeObserver(resize).observe(scrollEl);
    return resize;
  }

  /* ================= COVER: ring glow trail ================= */
  const RING_POINT = { x:0.50, y:0.84 }; // relative pos of the glowing ring in ring-img
  const ringImg = document.getElementById('ring-img');
  const coverScroll = document.getElementById('cover-scroll');
  const coverStage  = document.getElementById('cover-stage');
  const glowCanvas  = document.getElementById('glow-canvas');
  const gctx = glowCanvas.getContext('2d');
  let coverMX = -999, coverMY = -999, coverInside = false;
  let trailX = 0, trailY = 0, glowT = 0;

  function initCover(){
    fitStage(coverScroll, coverStage, ringImg.naturalWidth/ringImg.naturalHeight || 16/9);
    function resizeCanvas(){
      glowCanvas.width = coverStage.clientWidth;
      glowCanvas.height = coverStage.clientHeight;
    }
    resizeCanvas();
    new ResizeObserver(resizeCanvas).observe(coverStage);
    trailX = glowCanvas.width * RING_POINT.x;
    trailY = glowCanvas.height * RING_POINT.y;
    requestAnimationFrame(coverLoop);
  }
  if(ringImg.complete && ringImg.naturalWidth) initCover(); else ringImg.onload = initCover;

  function localPos(stageEl, clientX, clientY){
    const r = stageEl.getBoundingClientRect();
    return { x: clientX-r.left, y: clientY-r.top };
  }
  document.addEventListener('mousemove', e=>{
    if(document.getElementById('cover').classList.contains('visible')){
      const p = localPos(coverStage, e.clientX, e.clientY);
      const r = coverStage.getBoundingClientRect();
      coverInside = e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
      coverMX=p.x; coverMY=p.y;
    }
  });
  coverStage.addEventListener('touchmove', e=>{
    const t=e.touches[0]; const p=localPos(coverStage,t.clientX,t.clientY);
    coverMX=p.x; coverMY=p.y; coverInside=true;
  }, {passive:true});

  function coverLoop(){
    requestAnimationFrame(coverLoop);
    const W=glowCanvas.width, H=glowCanvas.height;
    if(!W||!H) return;
    gctx.clearRect(0,0,W,H);
    const ringX = W*RING_POINT.x, ringY = H*RING_POINT.y;
    glowT += 0.05;
    const pulse = 10 + Math.sin(glowT)*4;

    const targetX = coverInside ? coverMX : ringX;
    const targetY = coverInside ? coverMY : ringY;
    trailX += (targetX-trailX)*0.09;
    trailY += (targetY-trailY)*0.09;

    // beam from ring to trail
    gctx.save();
    gctx.strokeStyle = 'rgba(57,255,157,0.55)';
    gctx.lineWidth = 2.4;
    gctx.shadowColor = '#39ff9d';
    gctx.shadowBlur = 18;
    gctx.beginPath();
    gctx.moveTo(ringX, ringY);
    gctx.lineTo(trailX, trailY);
    gctx.stroke();
    gctx.restore();

    // ring glow (pulsing)
    let g = gctx.createRadialGradient(ringX,ringY,0,ringX,ringY,42+pulse);
    g.addColorStop(0,'rgba(150,255,210,0.85)');
    g.addColorStop(0.4,'rgba(57,255,157,0.45)');
    g.addColorStop(1,'rgba(57,255,157,0)');
    gctx.fillStyle=g;
    gctx.beginPath(); gctx.arc(ringX,ringY,42+pulse,0,Math.PI*2); gctx.fill();

    // cursor glow orb
    g = gctx.createRadialGradient(trailX,trailY,0,trailX,trailY,34);
    g.addColorStop(0,'rgba(180,255,220,0.9)');
    g.addColorStop(0.5,'rgba(57,255,157,0.4)');
    g.addColorStop(1,'rgba(57,255,157,0)');
    gctx.fillStyle=g;
    gctx.beginPath(); gctx.arc(trailX,trailY,34,0,Math.PI*2); gctx.fill();
  }

  /* ================= NAVIGATION ================= */
  document.getElementById('enter-btn').addEventListener('click', ()=>{
    document.getElementById('cover').classList.remove('visible');
    document.getElementById('reveal').classList.add('visible');
    initRevealIfNeeded();
  });
  document.getElementById('back-btn').addEventListener('click', ()=>{
    document.getElementById('reveal').classList.remove('visible');
    document.getElementById('cover').classList.add('visible');
    const a = document.getElementById('bg-audio');
    a.pause();
    revealStarted = false;
    document.getElementById('start-hint').style.display = 'flex';
  });

  /* ================= REVEAL: comic mask reveal ================= */
  let revealInit=false, revealStarted=false;
  let lineImg=null, colorImg=null, maskCanvas=null, maskCtx=null;
  let revMX=-999, revMY=-999, revInside=false, animId=null, fadeVol=0;
  const revealScroll = document.getElementById('reveal-scroll');
  const revealStage  = document.getElementById('reveal-stage');
  const revealCanvas = document.getElementById('reveal-canvas');

  function loadImg(src){
    return new Promise(res=>{ const im=new Image(); im.onload=()=>res(im); im.src=src; });
  }

  function initRevealIfNeeded(){
    if(revealInit) return; revealInit=true;
    Promise.all([loadImg('assets/bw.jpg'), loadImg('assets/color.jpg')]).then(([bw,color])=>{
      lineImg=bw; colorImg=color;
      fitStage(revealScroll, revealStage, bw.naturalWidth/bw.naturalHeight || 4/3);
      function resize(){
        revealCanvas.width = revealStage.clientWidth;
        revealCanvas.height = revealStage.clientHeight;
        maskCanvas = document.createElement('canvas');
        maskCanvas.width = revealCanvas.width; maskCanvas.height = revealCanvas.height;
        maskCtx = maskCanvas.getContext('2d');
      }
      resize();
      new ResizeObserver(resize).observe(revealStage);
      startRevealLoop();
    });
  }

  function drawCover(ctx,img,W,H){
    if(!img) return;
    const s = Math.max(W/img.naturalWidth, H/img.naturalHeight);
    const sw=img.naturalWidth*s, sh=img.naturalHeight*s;
    ctx.drawImage(img, (W-sw)/2, (H-sh)/2, sw, sh);
  }

  function startRevealLoop(){
    const ctx = revealCanvas.getContext('2d');
    const FADE=0.035, RADIUS=150;
    function draw(){
      animId=requestAnimationFrame(draw);
      const W=revealCanvas.width, H=revealCanvas.height;
      if(!W||!H||!maskCtx) return;
      const audio = document.getElementById('bg-audio');
      if(revealStarted){
        const target = revInside ? 0.4 : 0;
        fadeVol += (target-fadeVol)*0.06;
        audio.volume = Math.max(0,Math.min(1,fadeVol));
      }
      maskCtx.globalCompositeOperation='destination-out';
      maskCtx.fillStyle=`rgba(0,0,0,${FADE})`;
      maskCtx.fillRect(0,0,W,H);
      if(revInside){
        maskCtx.globalCompositeOperation='source-over';
        const g = maskCtx.createRadialGradient(revMX,revMY,0,revMX,revMY,RADIUS);
        g.addColorStop(0,'rgba(255,255,255,1)');
        g.addColorStop(0.55,'rgba(255,255,255,0.9)');
        g.addColorStop(0.8,'rgba(255,255,255,0.4)');
        g.addColorStop(1,'rgba(255,255,255,0)');
        maskCtx.fillStyle=g;
        maskCtx.beginPath(); maskCtx.arc(revMX,revMY,RADIUS,0,Math.PI*2); maskCtx.fill();
      }
      ctx.globalCompositeOperation='source-over';
      drawCover(ctx,lineImg,W,H);
      if(colorImg){
        const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H;
        const tctx=tmp.getContext('2d');
        drawCover(tctx,colorImg,W,H);
        tctx.globalCompositeOperation='destination-in';
        tctx.drawImage(maskCanvas,0,0);
        ctx.drawImage(tmp,0,0);
      }
      if(revInside){
        const g = ctx.createRadialGradient(revMX,revMY,RADIUS*0.4,revMX,revMY,RADIUS+80);
        g.addColorStop(0,'rgba(57,255,157,0.28)');
        g.addColorStop(0.5,'rgba(57,255,157,0.14)');
        g.addColorStop(1,'rgba(57,255,157,0)');
        ctx.globalCompositeOperation='screen';
        ctx.fillStyle=g;
        ctx.beginPath(); ctx.arc(revMX,revMY,RADIUS+80,0,Math.PI*2); ctx.fill();
        ctx.globalCompositeOperation='source-over';
      }
    }
    draw();
  }

  function beginIfNeeded(){
    if(revealStarted) return;
    revealStarted=true;
    document.getElementById('start-hint').style.display='none';
    const a=document.getElementById('bg-audio');
    a.currentTime=0; a.volume=0; a.play().catch(()=>{});
  }

  document.addEventListener('mousemove', e=>{
    if(!document.getElementById('reveal').classList.contains('visible')) return;
    const r = revealStage.getBoundingClientRect();
    revInside = e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
    if(revInside){ revMX=e.clientX-r.left; revMY=e.clientY-r.top; }
  });
  revealCanvas.addEventListener('click', ()=> beginIfNeeded());
  revealCanvas.addEventListener('touchstart', e=>{
    e.preventDefault(); beginIfNeeded();
    const t=e.touches[0]; const r=revealStage.getBoundingClientRect();
    revMX=t.clientX-r.left; revMY=t.clientY-r.top; revInside=true;
  }, {passive:false});
  revealCanvas.addEventListener('touchmove', e=>{
    e.preventDefault();
    const t=e.touches[0]; const r=revealStage.getBoundingClientRect();
    revMX=t.clientX-r.left; revMY=t.clientY-r.top; revInside=true;
  }, {passive:false});
  revealCanvas.addEventListener('touchend', ()=>{ revInside=false; });
})();
