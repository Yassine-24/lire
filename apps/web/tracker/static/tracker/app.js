(() => {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (browserZone) {
    const savedZone = document.cookie.split("; ").find((item) => item.startsWith("lire_timezone="))?.split("=")[1];
    const encodedZone = encodeURIComponent(browserZone);
    if (savedZone !== encodedZone) {
      document.cookie = "lire_timezone=" + encodedZone + "; Path=/; Max-Age=31536000; SameSite=Lax";
      window.location.reload();
      return;
    }
  }

  const formatDuration = (seconds) => {
    const minutes = Math.max(0, Math.floor(seconds / 60));
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours ? hours + " hr " + remainder + " min" : minutes + " min";
  };

  if (document.querySelector("[data-today-clock]")) {
    const midnight = new Date();
    midnight.setHours(24, 0, 2, 0);
    window.setTimeout(() => window.location.reload(), midnight.getTime() - Date.now());
  }

  document.querySelectorAll("[data-today-clock], [data-session-clock]").forEach((clock) => {
    const value = clock.querySelector("[data-clock-value]");
    const seconds = Number(clock.dataset.seconds || 0);
    const renderedAt = Date.parse(clock.dataset.renderedAt || "");
    const running = clock.dataset.running === "true";
    const render = () => {
      const added = running && Number.isFinite(renderedAt)
        ? Math.max(0, Math.floor((Date.now() - renderedAt) / 1000))
        : 0;
      const total = seconds + added;
      if (value) value.textContent = formatDuration(total);
      if (clock.hasAttribute("data-today-clock")) {
        clock.style.setProperty("--arc", Math.max(5, (total % 3600) / 3600 * 360).toFixed(1) + "deg");
      }
    };
    render();
    window.setInterval(render, 1000);
  });

  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    });
  });

  document.querySelectorAll(".shelf-change select").forEach((select) => {
    select.addEventListener("change", () => select.form.submit());
  });

  const catalog = document.querySelector("[data-catalog-search]");
  if (catalog) {
    const input = catalog.querySelector("#catalog-query");
    const results = catalog.querySelector("[data-catalog-results]");
    const endpoint = catalog.dataset.endpoint;
    let debounce;
    let requestId = 0;

    const clearResults = () => {
      results.replaceChildren();
    };

    const showMessage = (message, isError = false) => {
      clearResults();
      const note = document.createElement("p");
      note.className = isError ? "catalog-message error-copy" : "catalog-message";
      note.textContent = message;
      results.append(note);
    };

    const useBook = (book) => {
      const fields = {
        title: "id_title",
        author: "id_author",
        catalog_id: "id_catalog_id",
        isbn: "id_isbn",
        page_count: "id_page_count",
        cover_url: "id_cover_url",
        published_year: "id_published_year",
      };
      Object.entries(fields).forEach(([key, id]) => {
        const field = document.getElementById(id);
        if (field && book[key] !== undefined && book[key] !== null && book[key] !== "") {
          field.value = book[key];
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      document.querySelector("#id_title")?.focus();
      showMessage("Book details added below. Check the page total before saving.");
      document.querySelector(".book-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const search = async () => {
      const query = input.value.trim();
      if (query.length < 2) {
        showMessage("Type at least two characters to search.");
        return;
      }
      const thisRequest = ++requestId;
      showMessage("Searching Open Library…");
      try {
        const response = await fetch(endpoint + "?q=" + encodeURIComponent(query), {
          headers: { Accept: "application/json" },
        });
        const payload = await response.json();
        if (thisRequest !== requestId) return;
        if (!response.ok) {
          showMessage(payload.error || "Search is unavailable. You can still add the book by hand.", true);
          return;
        }
        if (!payload.results?.length) {
          showMessage("No close matches. Try another title or add the book by hand.");
          return;
        }
        clearResults();
        payload.results.forEach((book) => {
          const item = document.createElement("article");
          item.className = "catalog-result";
          if (book.cover_url) {
            const image = document.createElement("img");
            image.src = book.cover_url;
            image.alt = "";
            image.loading = "lazy";
            item.append(image);
          } else {
            const fallback = document.createElement("span");
            fallback.className = "cover-fallback catalog-cover-fallback";
            fallback.textContent = book.title.slice(0, 1).toUpperCase();
            item.append(fallback);
          }
          const details = document.createElement("span");
          details.className = "catalog-result-copy";
          const title = document.createElement("strong");
          title.textContent = book.title;
          const meta = document.createElement("small");
          meta.textContent = [book.author || "Author not listed", book.published_year, book.page_count ? book.page_count + " pages" : ""].filter(Boolean).join(" · ");
          details.append(title, meta);
          const choose = document.createElement("button");
          choose.type = "button";
          choose.className = "button button-small";
          choose.textContent = "Use";
          choose.addEventListener("click", () => useBook(book));
          item.append(details, choose);
          results.append(item);
        });
      } catch {
        if (thisRequest === requestId) showMessage("Could not reach Open Library. You can still add the book by hand.", true);
      }
    };

    input.addEventListener("input", () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(search, 400);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        window.clearTimeout(debounce);
        search();
      }
    });
  }
})();
