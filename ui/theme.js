// Classic script, loaded in <head> before the stylesheet paints, so the chosen theme never flashes.
// The Theme setting is "auto" (follow the system), "dark" or "light". The page always carries the
// resolved value in <html data-theme>, which is all the stylesheet reads.
(function () {
  var KEY = "agent-marketing-theme";
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  function stored() {
    try {
      var value = localStorage.getItem(KEY);
      return value === "dark" || value === "light" ? value : "auto";
    } catch (error) {
      return "auto";
    }
  }
  function apply() {
    var choice = stored();
    document.documentElement.dataset.theme = choice === "auto" ? (media && media.matches ? "light" : "dark") : choice;
  }
  window.deskTheme = {
    get: stored,
    set: function (choice) {
      try {
        if (choice === "dark" || choice === "light") localStorage.setItem(KEY, choice);
        else localStorage.removeItem(KEY);
      } catch (error) {
        /* Storage can be blocked; the choice then lasts until the page closes. */
        if (choice === "dark" || choice === "light") document.documentElement.dataset.theme = choice;
        else apply();
        return;
      }
      apply();
    },
  };
  if (media && media.addEventListener) media.addEventListener("change", apply);
  window.addEventListener("storage", function (event) { if (event.key === KEY) apply(); });
  apply();
})();
