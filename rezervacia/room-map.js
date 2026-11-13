/* Shared floor plan for the inline and expanded seating views. No backend access. */
(() => {
    const tables = [
        [1, 80, 70, 'rect'], [2, 220, 70, 'rect'],
        [3, 360, 70, 'rect'], [4, 500, 70, 'rect'],
        [5, 120, 265, 'circle'], [6, 240, 265, 'circle'],
        [7, 360, 265, 'circle'], [8, 485, 280, 'small'],
        [9, 575, 230, 'small'], [10, 715, 110, 'small'],
        [11, 850, 90, 'small'], [12, 710, 390, 'circle'],
        [13, 710, 495, 'large-circle'], [14, 905, 490, 'square']
    ];
    const plan = `<svg class="seating-architecture" viewBox="0 0 1280 640" aria-hidden="true">
        <defs><pattern id="floor-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#222454" stroke-opacity=".035"/></pattern></defs>
        <rect width="1280" height="640" fill="#f7f8fc"/><rect width="1280" height="640" fill="url(#floor-grid)"/>
        <path d="M8 8H1272V632H8V8Z M680 8V100 M680 210V355 M680 405V632 M8 360H86 M120 360H580V310H680 M8 405H580V632" class="seating-wall"/>
        <path d="M1040 190H1145 M1040 190V420H1145" class="seating-bar-wall"/>
        <rect x="1050" y="200" width="94" height="210" rx="8" fill="#e7e9f1"/>
        <text x="1097" y="310" class="seating-room-label" text-anchor="middle">BAR</text>
        <path d="M1180 420V470 M1180 545V632" class="seating-wall"/>
        <path d="M1180 540H1245A65 65 0 0 0 1180 475" fill="none" stroke="#b7bed0" stroke-width="2" stroke-dasharray="4 5"/>
        <text x="1198" y="515" class="seating-room-label">VCHOD</text>
        <rect x="20" y="85" width="6" height="210" rx="3" fill="#777da3"/>
        <text x="45" y="192" class="seating-room-label" transform="rotate(-90 45 192)" text-anchor="middle">PROJEKTOR</text>
        <rect x="825" y="20" width="115" height="6" rx="3" fill="#777da3"/>
        <text x="882" y="48" class="seating-room-label" text-anchor="middle">TV</text>
        <circle cx="62" cy="295" r="23" fill="#222454"/>
        <text x="62" y="299" text-anchor="middle" fill="white" font-size="10" font-weight="700">KVÍZ</text>
    </svg>`;

    function render(root, { assignments, splits, teams, onTable, onSplit }) {
        root.replaceChildren();
        const floor = document.createElement('div');
        floor.className = 'seating-floor';
        floor.innerHTML = plan;
        // Each SVG has its own pattern ID, including when both maps are visible.
        const patternId = `floor-grid-${root.id}`;
        floor.querySelector('pattern').id = patternId;
        floor.querySelector('[fill="url(#floor-grid)"]').setAttribute('fill', `url(#${patternId})`);
        for (const [id, x, y, shape] of tables) {
            const divided = id <= 4 && splits[id] === true;
            for (const part of (divided ? ['A', 'B'] : [''])) {
                // Keep legacy numeric keys for A, so existing assignments survive.
                const key = part === 'B' ? `${id}b` : String(id);
                const label = `${id}${part}`;
                const team = teams.find(t => t.id === assignments[key]);
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `seating-table seating-${divided ? 'half' : shape} ${team ? (team.confirmed ? 'seating-confirmed' : 'seating-reserved') : 'seating-free'}`;
                button.dataset.tableNum = key;
                button.dataset.tableLabel = label;
                button.style.left = `${(x + (part === 'B' ? 67 : 0)) / 12.8}%`;
                button.style.top = `${y / 6.4}%`;
                const name = team ? team.id : 'Voľný';
                button.title = `Stôl ${label} · ${name}${team ? ` · ${team.current || 0} osôb` : ''}`;
                button.setAttribute('aria-label', `${button.title}. Priradiť tím`);
                const number = document.createElement('span');
                number.className = 'seating-number';
                number.textContent = label;
                const text = document.createElement('span');
                text.className = 'seating-team';
                text.textContent = name;
                const count = document.createElement('span');
                count.className = 'seating-count';
                count.textContent = team ? `${team.current || 0} os.` : 'Priradiť tím';
                button.append(number, text, count);
                button.onclick = () => onTable(button);
                floor.append(button);
            }
            if (id <= 4) {
                const toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'seating-split';
                toggle.style.left = `${x / 12.8}%`;
                toggle.style.top = '24%';
                toggle.textContent = divided ? '↔ Spojiť' : 'Ⅱ Rozdeliť';
                toggle.setAttribute('aria-label', `${divided ? 'Spojiť' : 'Rozdeliť'} stôl ${id}`);
                toggle.setAttribute('aria-pressed', String(divided));
                toggle.onclick = () => onSplit(String(id));
                floor.append(toggle);
            }
        }
        root.append(floor);
    }
    window.QuizRoomMap = { render };
})();
