(function(){
  var want = (window.__want || "").trim().toLowerCase();
  var els = document.querySelectorAll("[role='option']");
  for (var i = 0; i < els.length; i++) {
    if ((els[i].innerText || "").trim().toLowerCase() === want) { els[i].click(); return "picked:" + (els[i].innerText||"").trim(); }
  }
  // partial fallback
  for (var j = 0; j < els.length; j++) {
    if ((els[j].innerText || "").trim().toLowerCase().indexOf(want) !== -1) { els[j].click(); return "picked~:" + (els[j].innerText||"").trim(); }
  }
  return "no-match:" + want + " count=" + els.length;
})();
