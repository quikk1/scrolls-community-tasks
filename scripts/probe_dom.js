(function(){
  function info(el){
    if(!el) return null;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      name: el.getAttribute("name") || null,
      type: el.type || null,
      aria: el.getAttribute("aria-label") || null,
      labelledby: el.getAttribute("aria-labelledby") || null,
      ph: el.getAttribute("placeholder") || null,
      testid: el.getAttribute("data-testid") || null,
      text: ((el.innerText || el.value || "")).trim().slice(0,40) || null
    };
  }
  var out = {};
  out.url = location.href.slice(0, 90);
  out.inputs = Array.prototype.map.call(document.querySelectorAll("input"), info);
  out.selects = Array.prototype.map.call(document.querySelectorAll("select"), function(s){
    var i = info(s);
    i.opts = Array.prototype.map.call(s.options, function(o){ return o.text; });
    return i;
  });
  out.comboboxes = Array.prototype.map.call(
    document.querySelectorAll("[role='combobox'], [role='listbox'], [aria-haspopup='listbox'], [role='button']"),
    info
  );
  out.buttons = Array.prototype.map.call(
    document.querySelectorAll("button, input[type='submit']"),
    info
  );
  return JSON.stringify(out, null, 1);
})();
