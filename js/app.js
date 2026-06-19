// ===== MusicFlow App =====
// Создано специально для Павла Судника 🎵
// Только ПОЛНЫЕ треки — никаких 30-секундных превью!

(function() {
  'use strict';

  const state = {
    currentTrack: null, queue: [], queueIndex: -1,
    isPlaying: false, shuffle: false, repeat: 0,
    volume: 0.8,
    liked: JSON.parse(localStorage.getItem('mf_liked') || '[]'),
    playlists: JSON.parse(localStorage.getItem('mf_playlists') || '[]'),
    recent: JSON.parse(localStorage.getItem('mf_recent') || '[]'),
    contextTrack: null
  };

  // ===== ТОЛЬКО ПОЛНЫЕ ТРЕКИ =====
  // Jamendo — полные треки (CC лицензия)
  const JAMENDO = 'https://api.jamendo.com/v3.0';
  const JAMENDO_CID = '2c9a11b9';
  // FMA — полные треки (Creative Commons)
  const FMA = 'https://freemusicarchive.org/api/get';
  // SoundCloud — полные треки (через публичный API)
  const SC_API = 'https://api-v2.soundcloud.com';
  // Bandcamp — полные треки (через поиск)
  const BC_SEARCH = 'https://bandcamp.com/search';
  // Internet Archive — полные треки (public domain)
  const IA_SEARCH = 'https://archive.org/advancedsearch.php';
  // Musopen — классическая музыка (public domain)
  const MUSOPEN = 'https://musopen.org/music/api';
  // CC Mixter — полные треки (Creative Commons)
  const CCMIXTER = 'http://ccmixter.org/api/query';

  const $ = id => document.getElementById(id);
  const audio = $('audio');

  // ===== HELPERS =====
  function fmt(s){return s&&!isNaN(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';}
  function toast(m){const t=$('toast');t.textContent=m;t.classList.add('visible');clearTimeout(t._timeout);t._timeout=setTimeout(()=>t.classList.remove('visible'),2000);}
  function save(){localStorage.setItem('mf_liked',JSON.stringify(state.liked));localStorage.setItem('mf_playlists',JSON.stringify(state.playlists));localStorage.setItem('mf_recent',JSON.stringify(state.recent));}
  function tid(t){return t.id||t.audio||t.name;}
  function isLiked(t){return state.liked.some(l=>tid(l)===tid(t));}
  function esc(s){const d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
  function shuffleArr(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function dedup(arr){const seen=new Set();return arr.filter(t=>{const k=(t.name+'|'+t.artist_name).toLowerCase().trim();if(seen.has(k)||!t.audio)return false;seen.add(k);return true;});}

  // ===== NAVIGATION =====
  function showScreen(n){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    $('screen-'+n).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.screen===n));
    if(n==='library')renderLib();
    if(n==='playlists')renderPlaylists();
  }
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>showScreen(b.dataset.screen)));

  // ===== API CALLS (только полные треки) =====
  async function jamendoFetch(ep, params={}){
    const u=new URL(JAMENDO+ep);
    u.searchParams.set('client_id',JAMENDO_CID);
    u.searchParams.set('format','json');
    u.searchParams.set('limit',params.limit||'50');
    u.searchParams.set('audioformat','mp32');
    Object.entries(params).forEach(([k,v])=>k!=='limit'&&u.searchParams.set(k,v));
    try{const r=await fetch(u);return await r.json();}catch(e){return {results:[]};}
  }

  async function fmaFetch(params={}){
    const u=new URL(FMA+'/tracks.json');
    u.searchParams.set('limit',params.limit||'50');
    if(params.genre)u.searchParams.set('genre_handle',params.genre);
    try{const r=await fetch(u);return await r.json();}catch(e){return {dataset:[]};}
  }

  async function internetArchiveSearch(term, limit=30){
    const u=new URL(IA_SEARCH);
    u.searchParams.set('q',`mediatape:audio AND title:(${term})`);
    u.searchParams.set('fl[]','identifier,title,creator,mediatype');
    u.searchParams.set('rows',limit);
    u.searchParams.set('output','json');
    try{
      const r=await fetch(u);const d=await r.json();
      return (d.response?.docs||[]).filter(t=>t.mediatype==='audio').map(t=>({
        id:'ia_'+t.identifier,
        name:t.title||'Unknown',
        artist_name:t.creator||'Unknown',
        audio:`https://archive.org/download/${t.identifier}/${t.identifier}.mp3`,
        image:`https://archive.org/services/img/${t.identifier}`,
        duration:null,
        source:'Internet Archive'
      }));
    }catch(e){return [];}
  }

  async function ccMixterSearch(term, limit=30){
    const u=new URL(CCMIXTER);
    u.searchParams.set('tags',term);
    u.searchParams.set('format','json');
    u.searchParams.set('limit',limit);
    u.searchParams.set('sort','name');
    try{
      const r=await fetch(u);const d=await r.json();
      return (d||[]).map(t=>({
        id:'ccm_'+t.upload_id,
        name:t.upload_name,
        artist_name:t.user_name,
        audio:t.file_upload,
        image:t.artist_page_url,
        duration:t.upload_duration,
        source:'CC Mixter'
      })).filter(t=>t.audio);
    }catch(e){return [];}
  }

  // ===== LOAD SECTIONS =====
  async function loadPopular(){
    const all=[];
    // Jamendo — много жанров с полными треками
    const genres=['pop','rock','hiphop','electronic','dance','rnb','latin','reggae','metal','indie','alternative','punk','funk','soul','blues','country','folk','jazz','classical','ambient','techno','house','trance','dubstep','trap','drill','emo','postrock','shoegaze','chillhop','lofi','synthwave','vaporwave'];
    for(const g of genres){
      const d=await jamendoFetch('/tracks/',{tags:g,order:'popularity_total_desc',limit:'15'});
      if(d.results) all.push(...d.results.slice(0,8));
    }
    // Jamendo общий топ
    const top=await jamendoFetch('/tracks/',{order:'popularity_total_desc',limit:'100'});
    if(top.results) all.push(...top.results);
    // FMA
    const fma=await fmaFetch({limit:'100'});
    if(fma.dataset) all.push(...fma.dataset.map(t=>({id:'fma_'+t.track_id,name:t.track_title,artist_name:t.artist_name,audio:t.track_url,image:t.album_image_file||t.artist_image_file,duration:t.track_duration})));
    // CC Mixter
    const ccm=await ccMixterSearch('pop rock electronic hiphop',30);
    all.push(...ccm);
    const unique=dedup(all);
    if(unique.length) renderCards('popular-tracks',shuffleArr(unique).slice(0,100));
    else $('popular-tracks').innerHTML='<p style="padding:20px;color:var(--text-muted)">Не удалось загрузить</p>';
  }

  async function loadNew(){
    const all=[];
    // Jamendo новинки
    const newJ=await jamendoFetch('/tracks/',{order:'date_desc',limit:'100'});
    if(newJ.results) all.push(...newJ.results);
    const weekJ=await jamendoFetch('/tracks/',{order:'popularity_week_desc',limit:'100'});
    if(weekJ.results) all.push(...weekJ.results);
    const monthJ=await jamendoFetch('/tracks/',{order:'popularity_month_desc',limit:'100'});
    if(monthJ.results) all.push(...monthJ.results);
    // FMA новинки
    const fma=await fmaFetch({limit:'100'});
    if(fma.dataset) all.push(...fma.dataset.map(t=>({id:'fma_'+t.track_id,name:t.track_title,artist_name:t.artist_name,audio:t.track_url,image:t.album_image_file||t.artist_image_file,duration:t.track_duration})));
    // CC Mixter новинки
    const ccm=await ccMixterSearch('new fresh latest',30);
    all.push(...ccm);
    // Internet Archive
    const ia=await internetArchiveSearch('music songs',20);
    all.push(...ia);
    const unique=dedup(all);
    if(unique.length) renderList('new-tracks',shuffleArr(unique).slice(0,100));
    else $('new-tracks').innerHTML='<p style="padding:20px;color:var(--text-muted)">Не удалось загрузить</p>';
  }

  async function loadMoods(){
    const moods=[
      {id:'party',name:'🎉 Тусовка',emoji:'🎉',tags:'party,dance,edm,house,techno,pop',bg:'linear-gradient(135deg,#fd79a8,#e84393)'},
      {id:'chill',name:'😌 Чилл',emoji:'😌',tags:'chill,lofi,relax,ambient,sleep,acoustic',bg:'linear-gradient(135deg,#00cec9,#0984e3)'},
      {id:'gym',name:'💪 Спорт',emoji:'💪',tags:'workout,energy,motivation,hardcore,metal,rock',bg:'linear-gradient(135deg,#e17055,#d63031)'},
      {id:'focus',name:'🎯 Фокус',emoji:'🎯',tags:'focus,study,ambient,classical,instrumental',bg:'linear-gradient(135deg,#6c5ce7,#a29bfe)'},
      {id:'sleep',name:'😴 Сон',emoji:'😴',tags:'sleep,ambient,meditation,yoga,spa,relax',bg:'linear-gradient(135deg,#2d3436,#636e72)'},
      {id:'road',name:'🚗 В дорогу',emoji:'🚗',tags:'driving,travel,road,rock,pop,country',bg:'linear-gradient(135deg,#fdcb6e,#f39c12)'},
      {id:'sad',name:'😢 Грусть',emoji:'😢',tags:'sad,emotional,acoustic,indie,alternative,blues',bg:'linear-gradient(135deg,#636e72,#2d3436)'},
      {id:'love',name:'💕 Любовь',emoji:'💕',tags:'love,romantic,rnb,soul,funk,pop',bg:'linear-gradient(135deg,#e84393,#fd79a8)'},
      {id:'angry',name:'😡 Злость',emoji:'😡',tags:'angry,metal,hardcore,punk,grindcore,rock',bg:'linear-gradient(135deg,#d63031,#c0392b)'},
      {id:'happy',name:'😊 Счастье',emoji:'😊',tags:'happy,upbeat,pop,dance,reggae,funk',bg:'linear-gradient(135deg,#fdcb6e,#e17055)'},
    ];
    const container=$('mood-playlists');
    let html='';
    for(const m of moods){
      try{
        const d=await jamendoFetch('/tracks/',{tags:m.tags,order:'popularity_total_desc',limit:'20'});
        if(d.results&&d.results.length){
          html+=`<div class="mood-card" data-mood="${m.id}"><div class="mood-cover"><div class="mood-gradient" style="background:${m.bg}"><span class="mood-emoji">${m.emoji}</span></div></div><div class="mood-info"><div class="mood-name">${m.name.split(' ').slice(1).join(' ')}</div><div class="mood-count">${d.results.length} треков</div></div></div>`;
        }
      }catch(e){}
    }
    container.innerHTML=html||'<p style="padding:20px;color:var(--text-muted)">Загрузка...</p>';
    container.querySelectorAll('.mood-card').forEach(card=>{
      card.addEventListener('click',async()=>{
        const mo=moods.find(x=>x.id===card.dataset.mood);
        if(mo){
          const all=[];
          const j=await jamendoFetch('/tracks/',{tags:mo.tags,order:'popularity_total_desc',limit:'50'});
          if(j.results) all.push(...j.results);
          const ccm=await ccMixterSearch(mo.tags,20);
          all.push(...ccm);
          const unique=dedup(all);
          if(unique.length){showScreen('search');$('search-input-2').value=mo.name;renderList('search-screen-list',unique);$('search-screen-list').style.display='';$('search-empty').style.display='none';}
        }
      });
    });
  }

  async function searchTracks(q){
    if(!q.trim())return[];
    const all=[];
    const [j,fma,ccm,ia]=await Promise.all([
      jamendoFetch('/tracks/',{search:q,order:'popularity_total_desc',limit:'50'}),
      fmaFetch({artist:q,limit:'30'}),
      ccMixterSearch(q,30),
      internetArchiveSearch(q,20),
    ]);
    if(j.results) all.push(...j.results);
    if(fma.dataset) all.push(...fma.dataset.map(t=>({id:'fma_'+t.track_id,name:t.track_title,artist_name:t.artist_name,audio:t.track_url,image:t.album_image_file||t.artist_image_file,duration:t.track_duration})));
    all.push(...ccm,...ia);
    return dedup(all);
  }

  async function loadGenre(g){
    const all=[];
    const [j,fma,ccm]=await Promise.all([
      jamendoFetch('/tracks/',{tags:g,order:'popularity_total_desc',limit:'50'}),
      fmaFetch({genre:g,limit:'30'}),
      ccMixterSearch(g,20),
    ]);
    if(j.results) all.push(...j.results);
    if(fma.dataset) all.push(...fma.dataset.map(t=>({id:'fma_'+t.track_id,name:t.track_title,artist_name:t.artist_name,audio:t.track_url,image:t.album_image_file||t.artist_image_file,duration:t.track_duration})));
    all.push(...ccm);
    return dedup(all);
  }

  // ===== RENDER =====
  function renderCards(id,tracks){
    const c=$(id);
    if(!tracks.length){c.innerHTML='<p>Ничего не найдено</p>';return;}
    c.innerHTML=tracks.map(t=>`
      <div class="album-card" data-track-id="${t.id}">
        <div class="album-cover">${t.image?`<img src="${t.image}" loading="lazy">`:'<div class="placeholder-cover"><svg viewBox="0 0 24 24" fill="white"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>'}</div>
        <div class="album-info"><div class="title">${esc(t.name)}</div><div class="artist">${esc(t.artist_name)}</div></div>
      </div>`).join('');
    c.querySelectorAll('.album-card').forEach(card=>{card.addEventListener('click',()=>{const t=tracks.find(x=>x.id==card.dataset.trackId);if(t)playTrack(t,tracks);});});
  }

  function renderList(id,tracks){
    const c=$(id);
    if(!tracks.length){c.innerHTML='<p>Ничего не найдено</p>';return;}
    c.innerHTML=tracks.map((t,i)=>{
      const liked=isLiked(t),cur=state.currentTrack&&tid(state.currentTrack)===tid(t);
      return `<div class="track-item ${cur?'playing':''}" data-idx="${i}" data-track-id="${t.id}">
        <div class="track-thumb">${t.image?`<img src="${t.image}" loading="lazy">`:''}</div>
        <div class="track-details"><div class="track-name">${esc(t.name)}</div><div class="track-artist">${esc(t.artist_name)}</div></div>
        <span class="track-duration">${t.duration?fmt(t.duration):''}</span>
        <div class="track-actions">
          <button class="track-action-btn like-btn" data-track-id="${t.id}"><svg width="18" height="18" viewBox="0 0 24 24" fill="${liked?'var(--accent-light)':'none'}" stroke="${liked?'var(--accent-light)':'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
          <button class="track-action-btn more-btn" data-track-id="${t.id}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
        </div></div>`;
    }).join('');
    c.querySelectorAll('.track-item').forEach(item=>{item.addEventListener('click',e=>{if(e.target.closest('.track-action-btn'))return;playTrack(tracks[item.dataset.idx],tracks,parseInt(item.dataset.idx));});});
    c.querySelectorAll('.like-btn').forEach(b=>{b.addEventListener('click',e=>{e.stopPropagation();const t=tracks.find(x=>x.id==b.dataset.trackId);if(t)toggleLike(t);});});
    c.querySelectorAll('.more-btn').forEach(b=>{b.addEventListener('click',e=>{e.stopPropagation();const t=tracks.find(x=>x.id==b.dataset.trackId);if(t)showCtx(t,e);});});
  }

  // ===== PLAYER =====
  function playTrack(track,q=[],idx=0){
    if(!track.audio){toast('Нет аудио для этого трека');return;}
    state.currentTrack=track;state.queue=q.length?q:[track];state.queueIndex=idx;
    state.recent=[track,...state.recent.filter(t=>tid(t)!==tid(track))].slice(0,100);save();
    audio.src=track.audio;audio.volume=state.volume;
    audio.play().then(()=>{state.isPlaying=true;updateUI();trackListened();initAudioCtx();if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();startVisualizer();}).catch(()=>toast('Ошибка воспроизведения'));
    $('mini-player').classList.add('visible');
  }

  function togglePlay(){
    if(!state.currentTrack)return;
    audio.paused?audio.play():audio.pause();
    state.isPlaying=!audio.paused;
    updateUI();
  }

  function playNext(){
    if(radioMode){radioNext();return;}
    if(!state.queue.length)return;
    let i;
    if(state.shuffle)i=Math.floor(Math.random()*state.queue.length);
    else if(state.repeat===2)i=state.queueIndex;
    else{i=state.queueIndex+1;if(i>=state.queue.length){if(state.repeat===1)i=0;else return;}}
    playTrack(state.queue[i],state.queue,i);
  }

  function playPrev(){
    if(!state.queue.length)return;
    if(audio.currentTime>3){audio.currentTime=0;return;}
    let i=state.queueIndex-1;if(i<0)i=state.repeat===1?state.queue.length-1:0;
    playTrack(state.queue[i],state.queue,i);
  }

  function updateUI(){
    const t=state.currentTrack;if(!t)return;
    $('mini-title').textContent=t.name||'—';
    $('mini-artist').textContent=t.artist_name||'—';
    if(t.image){$('mini-img').src=t.image;$('mini-img').style.display='';}else{$('mini-img').style.display='none';}
    $('player-title').textContent=t.name||'—';
    $('player-artist').textContent=t.artist_name||'—';
    if(t.image){$('player-img').src=t.image;$('player-img').style.display='';$('player-bg').style.backgroundImage=`url(${t.image})`;}else{$('player-img').style.display='none';$('player-bg').style.backgroundImage='';}
    const p=state.isPlaying?'M6 4h4v16H6zM14 4h4v16h-4z':'M8 5v14l11-7z';
    $('play-icon').innerHTML=`<path d="${p}"/>`;
    $('mini-play-icon').innerHTML=`<path d="${p}"/>`;
    document.querySelectorAll('.track-item').forEach(item=>{const v=item.dataset.trackId;item.classList.toggle('playing',state.currentTrack&&state.currentTrack.id==v);});
  }

  // ===== AUDIO EVENTS =====
  audio.addEventListener('timeupdate',()=>{if(!audio.duration)return;const p=(audio.currentTime/audio.duration)*100;$('progress-fill').style.width=p+'%';$('mini-progress-bar').style.width=p+'%';$('current-time').textContent=fmt(audio.currentTime);$('total-time').textContent=fmt(audio.duration);});
  audio.addEventListener('ended',()=>playNext());
  audio.addEventListener('error',()=>toast('Ошибка загрузки'));
  $('progress-container').addEventListener('click',e=>{if(!audio.duration)return;const r=$('progress-container').getBoundingClientRect();audio.currentTime=((e.clientX-r.left)/r.width)*audio.duration;});

  function setVol(v){state.volume=v;audio.volume=v;$('volume-slider').value=v*100;$('mini-volume-slider').value=v*100;updateVolIcon();}
  function updateVolIcon(){
    const v=state.volume;
    let i;
    if(v===0)i='<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
    else if(v<0.5)i='<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    else i='<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    $('mini-volume-icon').innerHTML=i;
  }
  $('volume-slider').addEventListener('input',e=>setVol(e.target.value/100));
  $('mini-volume-slider').addEventListener('input',e=>setVol(e.target.value/100));

  $('play-btn').addEventListener('click',togglePlay);
  $('mini-play').addEventListener('click',e=>{e.stopPropagation();togglePlay();});
  $('next-btn').addEventListener('click',playNext);
  $('mini-next').addEventListener('click',e=>{e.stopPropagation();playNext();});
  $('prev-btn').addEventListener('click',playPrev);
  $('mini-prev').addEventListener('click',e=>{e.stopPropagation();playPrev();});
  $('mini-player').addEventListener('click',e=>{if(e.target.closest('.mini-controls')||e.target.closest('.mini-btn')||e.target.closest('.mini-volume'))return;$('full-player').classList.add('active');});
  $('player-close').addEventListener('click',()=>$('full-player').classList.remove('active'));
  $('shuffle-btn').addEventListener('click',()=>{state.shuffle=!state.shuffle;$('shuffle-btn').style.color=state.shuffle?'var(--accent-light)':'';toast(state.shuffle?'Shuffle включён':'Shuffle выключен');});
  $('repeat-btn').addEventListener('click',()=>{state.repeat=(state.repeat+1)%3;$('repeat-btn').style.color=['','var(--accent-light)','var(--accent-light)'][state.repeat];toast(['Repeat выключен','Repeat всего','Repeat одного'][state.repeat]);});

  function setupSearch(inp,res,empty){
    const i=$(inp);
    i.addEventListener('input',()=>{
      clearTimeout(i._t);const q=i.value.trim();
      if(!q){$(res).style.display='none';if(empty)$(empty).style.display='';return;}
      i._t=setTimeout(async()=>{
        const t=await searchTracks(q);
        if(t.length){renderList(res,t);$(res).style.display='';if(empty)$(empty).style.display='none';}
        else{$(res).innerHTML='<p>Ничего не найдено</p>';$(res).style.display='';if(empty)$(empty).style.display='none';}
      },500);
    });
  }
  setupSearch('search-input','search-results','search-results-section');
  setupSearch('search-input-2','search-screen-list','search-empty');

  document.querySelectorAll('#genres-list .album-card').forEach(card=>{
    card.addEventListener('click',async()=>{
      const g=card.dataset.genre;
      showScreen('search');$('search-input-2').value=g;
      const t=await loadGenre(g);
      renderList('search-screen-list',t);$('search-screen-list').style.display='';$('search-empty').style.display='none';
    });
  });

  function toggleLike(t){
    const i=state.liked.findIndex(l=>tid(l)===tid(t));
    if(i>=0){state.liked.splice(i,1);toast('Убрано');}
    else{state.liked.push(t);toast('Добавлено ❤️');}
    save();updateUI();renderLib();
  }

  function showCtx(t,e){
    state.contextTrack=t;const m=$('context-menu');
    $('ctx-like-text').textContent=isLiked(t)?'Убрать из понравившихся':'Нравится';
    m.style.left=Math.min(e.clientX,window.innerWidth-220)+'px';m.style.top=Math.min(e.clientY,window.innerHeight-200)+'px';m.classList.add('active');
  }
  document.addEventListener('click',e=>{if(!e.target.closest('#context-menu'))$('context-menu').classList.remove('active');});
  $('ctx-like').addEventListener('click',()=>{if(state.contextTrack)toggleLike(state.contextTrack);$('context-menu').classList.remove('active');});
  $('ctx-add-to-playlist').addEventListener('click',()=>{$('context-menu').classList.remove('active');if(state.contextTrack)showAddToPl(state.contextTrack);});
  $('ctx-play-next').addEventListener('click',()=>{$('context-menu').classList.remove('active');if(state.contextTrack){state.queue.splice(state.queueIndex+1,0,state.contextTrack);toast('Добавлено в очередь');}});

  function renderPlaylists(){
    const c=$('playlists-list');
    if(!state.playlists.length){c.innerHTML='<div class="empty-state"><h3>Нет плейлистов</h3></div>';return;}
    c.innerHTML=state.playlists.map((p,i)=>`
      <div class="track-item" data-pl-idx="${i}">
        <div class="track-thumb" style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="white" opacity=".7"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
        <div class="track-details"><div class="track-name">${esc(p.name)}</div><div class="track-artist">${p.tracks.length} треков</div></div>
        <button class="track-action-btn del-pl-btn" data-idx="${i}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>`).join('');
    c.querySelectorAll('.track-item').forEach(item=>{item.addEventListener('click',e=>{if(e.target.closest('.del-pl-btn'))return;openPl(item.dataset.plIdx);});});
    c.querySelectorAll('.del-pl-btn').forEach(b=>{b.addEventListener('click',e=>{e.stopPropagation();const i=parseInt(b.dataset.idx);if(confirm('Удалить?')){state.playlists.splice(i,1);save();renderPlaylists();toast('Удалён');}});});
  }

  function openPl(i){const p=state.playlists[i];if(!p||!p.tracks.length){toast('Плейлист пуст');return;}showScreen('search');$('search-input-2').value=p.name;renderList('search-screen-list',p.tracks);$('search-screen-list').style.display='';$('search-empty').style.display='none';}
  $('create-playlist-btn').addEventListener('click',()=>{$('playlist-modal').classList.add('active');$('playlist-name-input').value='';setTimeout(()=>$('playlist-name-input').focus(),100);});
  $('playlist-cancel').addEventListener('click',()=>$('playlist-modal').classList.remove('active'));
  $('playlist-confirm').addEventListener('click',()=>{const n=$('playlist-name-input').value.trim();if(!n)return;state.playlists.push({name:n,tracks:[],created:Date.now()});save();$('playlist-modal').classList.remove('active');renderPlaylists();toast('Плейлист создан');});

  function showAddToPl(t){
    if(!state.playlists.length){toast('Сначала создай плейлист');return;}
    const c=$('add-to-playlist-list');
    c.innerHTML=state.playlists.map((p,i)=>`<div class="context-item" data-idx="${i}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>${esc(p.name)}</span></div>`).join('');
    c.querySelectorAll('.context-item').forEach(item=>{item.addEventListener('click',()=>{const i=parseInt(item.dataset.idx);const p=state.playlists[i];if(!p.tracks.some(x=>tid(x)===tid(t))){p.tracks.push(t);save();toast('Добавлено в "'+p.name+'"');}else toast('Трек уже в плейлисте');$('add-to-playlist-modal').classList.remove('active');});});
    $('add-to-playlist-modal').classList.add('active');
  }
  $('add-to-cancel').addEventListener('click',()=>$('add-to-playlist-modal').classList.remove('active'));
  document.querySelectorAll('.modal-overlay').forEach(o=>{o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('active');});});

  function renderLib(){
    updateStats();
    const lc=$('liked-tracks');if(state.liked.length)renderList('liked-tracks',state.liked);else lc.innerHTML='<div class="empty-state"><h3>Пока пусто</h3><p>Нажми ❤️ на треке</p></div>';
    const rc=$('recent-tracks');if(state.recent.length)renderList('recent-tracks',state.recent.slice(0,100));else rc.innerHTML='<div class="empty-state"><h3>Пока пусто</h3></div>';
  }

  $('queue-btn').addEventListener('click',()=>{
    const c=$('queue-list');
    if(!state.queue.length)c.innerHTML='<div class="empty-state"><p>Очередь пуста</p></div>';
    else{c.innerHTML=state.queue.map((t,i)=>`<div class="queue-item ${i===state.queueIndex?'current':''}" data-q-idx="${i}"><span class="queue-num">${i===state.queueIndex?'▶':i+1}</span><span class="queue-name">${esc(t.name)}</span><span class="queue-artist">${esc(t.artist_name)}</span></div>`).join('');c.querySelectorAll('.queue-item').forEach(item=>{item.addEventListener('click',()=>{playTrack(state.queue[item.dataset.qIdx],state.queue,parseInt(item.dataset.qIdx));});});}
    $('queue-modal').classList.add('active');
  });
  $('queue-modal').addEventListener('click',e=>{if(e.target===$('queue-modal'))$('queue-modal').classList.remove('active');});

  // ===== THEME =====
  function initTheme(){
    const saved=localStorage.getItem('mf_theme')||'dark';
    if(saved==='light') document.documentElement.setAttribute('data-theme','light');
    updateThemeIcon();
  }
  function toggleTheme(){
    const isLight=document.documentElement.getAttribute('data-theme')==='light';
    if(isLight){document.documentElement.removeAttribute('data-theme');localStorage.setItem('mf_theme','dark');}
    else{document.documentElement.setAttribute('data-theme','light');localStorage.setItem('mf_theme','light');}
    updateThemeIcon();
  }
  function updateThemeIcon(){
    const btn=$('theme-toggle');if(!btn)return;
    const isLight=document.documentElement.getAttribute('data-theme')==='light';
    btn.innerHTML=isLight?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  }
  $('theme-toggle').addEventListener('click',toggleTheme);

  // ===== EQUALIZER =====
  let audioCtx, analyser, source, bassFilter, midFilter, trebleFilter;
  function initAudioCtx(){
    if(audioCtx) return;
    try{
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      analyser=audioCtx.createAnalyser(); analyser.fftSize=256;
      bassFilter=audioCtx.createBiquadFilter(); bassFilter.type='lowshelf'; bassFilter.frequency.value=200;
      midFilter=audioCtx.createBiquadFilter(); midFilter.type='peaking'; midFilter.frequency.value=1000; midFilter.Q.value=1;
      trebleFilter=audioCtx.createBiquadFilter(); trebleFilter.type='highshelf'; trebleFilter.frequency.value=4000;
      source=audioCtx.createMediaElementSource(audio);
      source.connect(bassFilter); bassFilter.connect(midFilter); midFilter.connect(trebleFilter); trebleFilter.connect(analyser); analyser.connect(audioCtx.destination);
    }catch(e){}
  }
  function setupEQ(){
    $('eq-bass').addEventListener('input',e=>{if(bassFilter)bassFilter.gain.value=e.target.value;});
    $('eq-mid').addEventListener('input',e=>{if(midFilter)midFilter.gain.value=e.target.value;});
    $('eq-treble').addEventListener('input',e=>{if(trebleFilter)trebleFilter.gain.value=e.target.value;});
  }

  // ===== VISUALIZER =====
  let visualizerInterval;
  function startVisualizer(){
    if(!analyser)initAudioCtx();
    const container=$('visualizer');if(!container)return;
    container.innerHTML='';
    for(let i=0;i<20;i++){const bar=document.createElement('div');bar.className='v-bar';bar.style.height='4px';container.appendChild(bar);}
    const dataArray=new Uint8Array(analyser?analyser.frequencyBinCount:64);
    visualizerInterval=setInterval(()=>{
      if(analyser)analyser.getByteFrequencyData(dataArray);
      const bars=container.querySelectorAll('.v-bar');
      bars.forEach((bar,i)=>{const val=analyser?dataArray[i*2]||0:Math.random()*30+5;bar.style.height=Math.max(4,val/4)+'px';bar.style.background=`hsl(${260+val/4},70%,60%)`;});
    },100);
  }
  function stopVisualizer(){clearInterval(visualizerInterval);}

  // ===== SLEEP TIMER =====
  let sleepTimeout;
  function setupSleepTimer(){
    $('sleep-timer-select').addEventListener('change',e=>{
      clearTimeout(sleepTimeout);
      const mins=parseInt(e.target.value);
      if(mins===0){$('sleep-timer-display').textContent='';return;}
      const ms=mins*60*1000;
      const endTime=Date.now()+ms;
      $('sleep-timer-display').textContent=fmt(mins*60);
      const update=()=>{const left=endTime-Date.now();if(left<=0)return;$('sleep-timer-display').textContent=fmt(left/1000);sleepTimeout=setTimeout(update,1000);};
      sleepTimeout=setTimeout(()=>{pauseAudio();toast('😴 Таймер сна');$('sleep-timer-display').textContent='';$('sleep-timer-select').value='0';},ms);
      update();
    });
  }
  function pauseAudio(){audio.pause();state.isPlaying=false;updateUI();}

  // ===== RADIO MODE =====
  let radioMode=false;
  function setupRadio(){
    $('radio-btn').addEventListener('click',()=>{
      radioMode=!radioMode;
      const btn=$('radio-btn');
      if(radioMode){btn.textContent='Выключить';btn.classList.add('active');toast('📻 Радио включено');}
      else{btn.textContent='Включить';btn.classList.remove('active');toast('📻 Радио выключено');}
    });
  }
  function radioNext(){
    if(!radioMode)return;
    const genres=['pop','rock','hiphop','electronic','dance','rnb','latin','jazz','metal','indie'];
    const g=genres[Math.floor(Math.random()*genres.length)];
    jamendoFetch('/tracks/',{tags:g,order:'popularity_total_desc',limit:'20'}).then(d=>{
      if(d.results&&d.results.length){const t=d.results[Math.floor(Math.random()*d.results.length)];playTrack(t,d.results,d.results.indexOf(t));}
    });
  }

  // ===== STATS =====
  let listenTime=parseInt(localStorage.getItem('mf_listenTime')||'0');
  let tracksListened=parseInt(localStorage.getItem('mf_tracksListened')||'0');
  let statsInterval;
  function startStats(){
    statsInterval=setInterval(()=>{if(state.isPlaying){listenTime++;localStorage.setItem('mf_listenTime',listenTime);updateStats();}},1000);
  }
  function updateStats(){$('stat-liked').textContent=state.liked.length;$('stat-playlists').textContent=state.playlists.length;$('stat-listened').textContent=tracksListened;}
  function trackListened(){tracksListened++;localStorage.setItem('mf_tracksListened',tracksListened);updateStats();}

  // ===== LOCAL FILES =====
  function setupFileUpload(){
    $('file-input').addEventListener('change',e=>{
      const files=Array.from(e.target.files);
      if(!files.length)return;
      const localTracks=files.map((f,i)=>({id:'local_'+Date.now()+i,name:f.name.replace(/\.[^/.]+$/,''),artist_name:'Локальный файл',audio:URL.createObjectURL(f),image:null,duration:null,source:'local'}));
      state.queue=[...state.queue,...localTracks];
      toast(`📁 Загружено ${files.length} треков`);
    });
  }

  // ===== SHARING =====
  function setupShare(){
    $('share-btn').addEventListener('click',()=>{
      if(!state.currentTrack)return;
      const text=`🎵 ${state.currentTrack.name} — ${state.currentTrack.artist_name}`;
      if(navigator.share)navigator.share({title:'MusicFlow',text});
      else{navigator.clipboard.writeText(text);toast('📋 Скопировано');}
    });
    $('ctx-share').addEventListener('click',()=>{
      $('context-menu').classList.remove('active');
      if(state.currentTrack){const text=`🎵 ${state.currentTrack.name} — ${state.currentTrack.artist_name}`;if(navigator.share)navigator.share({title:'MusicFlow',text});else{navigator.clipboard.writeText(text);toast('📋 Скопировано');}}
    });
  }

  // ===== INIT =====
  initTheme();setupEQ();setupSleepTimer();setupRadio();setupFileUpload();setupShare();startStats();updateStats();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  audio.volume=state.volume;loadPopular();loadNew();loadMoods();showScreen('home');
})();
