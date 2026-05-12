import re

# Read the new CSS from our patch file
with open('.newtab-styles-patch.ts', 'r') as f:
    new_css = f.read()

# We need to prepend the root variables
root_vars = """
    :root {
      color-scheme: light dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --jpdb-reader-accent: #2e6648;
      --jpdb-newtab-bg: #5ea780;
      --jpdb-newtab-bg-text: #142019;
      --jpdb-newtab-surface: #fbfcf8;
      --jpdb-newtab-surface-muted: #eef5ef;
      --jpdb-newtab-surface-text: #142019;
      --jpdb-newtab-border: rgba(255,255,255,.55);
      --jpdb-newtab-soft-border: rgba(20,32,25,.16);
      --jpdb-newtab-shadow: rgba(18,28,23,.2);
      --jpdb-newtab-accent-text: #2e6648;
    }

    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      min-height: 100dvh;
      margin: 0;
      background: var(--jpdb-newtab-bg);
      color: var(--jpdb-newtab-bg-text);
      overflow-x: hidden;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
"""

combined_css = root_vars + "\n" + new_css

# The new HTML template string (to replace inside the script)
new_html = """
          <div class="jpdb-reader-newtab-shell">
            <h1 class="sr-only">Yomu New Tab</h1>
            <header class="jpdb-reader-newtab-topbar">
              <a class="jpdb-reader-newtab-brand" href="https://hrussellzfac023.github.io/yomu-reader/"><span class="jpdb-reader-newtab-brand-mark">よむ</span><span class="jpdb-reader-newtab-brand-text"><strong>よむ</strong><span>standalone demo</span></span></a>
              <span class="jpdb-reader-newtab-status">Demo dictionary words</span>
              <a class="jpdb-reader-newtab-brand" href="https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js"><span>Install userscript</span></a>
            </header>
            <div class="jpdb-reader-newtab-workspace">
              <section class="jpdb-reader-newtab-stage">
                <div class="jpdb-reader-newtab-card" data-newtab-card tabindex="0">
                  <div class="jpdb-reader-newtab-card-head"><span data-kicker>Word recall</span><span data-count></span></div>
                  <div class="jpdb-reader-newtab-visual" data-visual></div>
                  <div class="jpdb-reader-newtab-word" data-word lang="ja"></div>
                  <div class="jpdb-reader-newtab-answer"><div class="jpdb-reader-newtab-reading" data-reading lang="ja"></div><div class="jpdb-reader-newtab-meaning" data-meaning></div></div>
                  <div class="jpdb-reader-newtab-concealed">Reading and meaning are hidden until reveal.</div>
                  <div class="jpdb-reader-newtab-meta" data-meta></div>
                </div>
                <div class="jpdb-reader-newtab-controls">
                  <button class="jpdb-reader-newtab-button" type="button" data-reveal>Reveal</button>
                  <button class="jpdb-reader-newtab-button primary" type="button" data-next>Next</button>
                  <span class="jpdb-reader-newtab-status">Refresh keeps this word. A fresh tab rolls a new one.</span>
                </div>
              </section>
              <aside class="jpdb-reader-newtab-side">
                <section class="jpdb-reader-newtab-panel">
                  <div class="jpdb-reader-newtab-panel-head"><span>Mode</span><span>Demo</span></div>
                  <div class="jpdb-reader-newtab-segmented"><button class="active" type="button">Word</button><button type="button" data-kanji>Kanji</button></div>
                  <div class="jpdb-reader-newtab-form-grid"><label>Source<select><option>Dictionary demo</option></select></label><label>Sort<select><option>Random</option></select></label></div>
                  <label class="jpdb-reader-newtab-search">Search<input type="search" aria-label="Search demo words" placeholder="Install よむ for your own words"></label>
                </section>
                <section class="jpdb-reader-newtab-panel">
                  <div class="jpdb-reader-newtab-panel-head"><span>Show only</span><span>${cards.length} words</span></div>
                  <div class="jpdb-reader-newtab-filter-grid"><button data-active="true">Study</button><button>All</button><button>New</button><button>Due</button><button>Known</button><button>Dictionary</button></div>
                </section>
                <section class="jpdb-reader-newtab-panel jpdb-reader-newtab-queue-panel">
                  <div class="jpdb-reader-newtab-panel-head"><span>2D review tray</span><span>Pick any word</span></div>
                  <div class="jpdb-reader-newtab-list" data-list></div>
                </section>
                <section class="jpdb-reader-newtab-source-note"><p>Without the userscript, this page runs as a small standalone demo. With よむ installed, it uses JPDB, Anki, or your local dictionaries and can download the starter dictionary when needed.</p></section>
              </aside>
            </div>
          </div>
          <a class="jpdb-reader-newtab-puck" href="https://hrussellzfac023.github.io/yomu-reader/" aria-label="Open Yomu">よむ</a>
"""

new_fallback_markup = """
    <div class="jpdb-reader-newtab-shell">
      <h1 class="sr-only">Yomu New Tab</h1>
      <header class="jpdb-reader-newtab-topbar">
        <a class="jpdb-reader-newtab-brand" href="https://hrussellzfac023.github.io/yomu-reader/">
          <span class="jpdb-reader-newtab-brand-mark">よむ</span>
          <span class="jpdb-reader-newtab-brand-text"><strong>よむ</strong><span>new tab</span></span>
        </a>
        <span class="jpdb-reader-newtab-status">Loading study sources...</span>
        <a class="jpdb-reader-newtab-brand" href="https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js"><span>Install userscript</span></a>
      </header>
      <section class="jpdb-reader-newtab-stage">
        <div class="jpdb-reader-newtab-card">
          <div class="jpdb-reader-newtab-card-head"><span>Preparing</span><span>0 / 0</span></div>
          <div class="jpdb-reader-newtab-visual">読</div>
          <div class="jpdb-reader-newtab-word" lang="ja">よむ</div>
          <div class="jpdb-reader-newtab-answer"><div class="jpdb-reader-newtab-reading" lang="ja">loading</div><div class="jpdb-reader-newtab-meaning">Preparing your study cards.</div></div>
          <div class="jpdb-reader-newtab-concealed">Recall first, then reveal.</div>
          <div class="jpdb-reader-newtab-meta"><span>Dictionary fallback</span><span>JPDB optional</span><span>Anki optional</span></div>
        </div>
      </section>
    </div>
"""

def update_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Replace <style>...</style>
    content = re.sub(r'<style>.*?</style>', f'<style>\n{combined_css}\n  </style>', content, flags=re.DOTALL)

    # Replace the <main>...</main> initial block
    content = re.sub(r'<div class="jpdb-reader-newtab-shell">.*?</div>\n  </main>', f'{new_fallback_markup.strip()}\n  </main>', content, flags=re.DOTALL)

    # Replace the innerHTML injection block
    content = re.sub(r'root\.innerHTML = `.*?`;', f'root.innerHTML = `\n{new_html}`;\n', content, flags=re.DOTALL)

    # Update JS render function query selectors
    content = content.replace("root.querySelector('.card')", "root.querySelector('.jpdb-reader-newtab-card')")
    content = content.replace("'newtab-hidden'", "'jpdb-reader-newtab-revealed'")
    # Note: the original code had: classList.toggle('newtab-hidden', !revealed)
    # the new CSS expects: classList.toggle('jpdb-reader-newtab-revealed', revealed)
    content = content.replace("toggle('newtab-hidden', !revealed)", "toggle('jpdb-reader-newtab-revealed', revealed)")

    # Update template literal for list items
    content = content.replace(
        """`<button class="${itemIndex === index ? 'active' : ''}" type="button" data-index="${itemIndex}"><span lang="ja">${item.word}</span><small>${item.state}</small></button>`""",
        """`<button class="jpdb-reader-newtab-list-item ${itemIndex === index ? 'active' : ''}" type="button" data-index="${itemIndex}"><span lang="ja">${item.word}</span><small>${item.state}</small></button>`"""
    )
    
    # update list item class logic:
    # it already adds .active, but base class should be .jpdb-reader-newtab-list-item
    content = content.replace(
        "root.querySelector('.jpdb-reader-newtab-card')?.classList.toggle('jpdb-reader-newtab-revealed', revealed)",
        "const c = root.querySelector('.jpdb-reader-newtab-card'); if(c) { c.classList.toggle('jpdb-reader-newtab-revealed', revealed); c.classList.toggle('jpdb-reader-newtab-kanji-mode', isKanji); }"
    )
    
    with open(filepath, 'w') as f:
        f.write(content)

update_file('public/newtab/index.html')
update_file('docs/newtab/index.html')
print("HTML files updated")
