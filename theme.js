(() => {
  function apply(value){
    const preference=['light','dark','system'].includes(value)?value:'system';
    const dark=preference==='dark'||preference==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.style.colorScheme=dark?'dark':'light';
    for(const select of document.querySelectorAll('[data-theme-setting]'))select.value=preference;
  }
  const read=()=>{try{return localStorage.getItem('study-theme')||'system';}catch{return 'system';}};
  apply(read());
  document.addEventListener('change',event=>{if(event.target.matches('[data-theme-setting]')){try{localStorage.setItem('study-theme',event.target.value);}catch{}apply(event.target.value);}});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>apply(read()));
  window.addEventListener('storage',event=>{if(event.key==='study-theme')apply(read());});
  window.addEventListener('study:page-prepared',()=>apply(read()));
  window.addEventListener('study:navigated',()=>apply(read()));
  document.addEventListener('DOMContentLoaded',()=>apply(read()));
})();
