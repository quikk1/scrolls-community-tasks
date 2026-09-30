(function(){
  var els = document.querySelectorAll("[role='option'], [role='listbox'] li, ul li");
  var out = Array.prototype.map.call(els, function(o){
    return {
      role: o.getAttribute("role"),
      cls: (o.getAttribute("class") || "").slice(0, 50),
      text: (o.innerText || "").trim().slice(0, 40)
    };
  });
  return JSON.stringify({count: els.length, opts: out}, null, 1);
})();
