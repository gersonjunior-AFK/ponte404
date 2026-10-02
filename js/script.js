const events = [
  {
    id: 'eixao', title: 'Feira do Eixão', category: 'Comida', place: 'Eixão do Lazer · Asa Norte', day: 'SÁB', date: '03', time: '9h — 15h', price: 'Entrada grátis',
    image: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=900&q=80', alt: 'Bancas coloridas de uma feira ao ar livre'
  },
  {
    id: 'calçada', title: 'Baile da Calçada', category: 'Música', place: 'Infinu · 506 Sul', day: 'SEX', date: '02', time: '20h — 2h', price: 'A partir de R$ 25',
    image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80', alt: 'Público reunido em um show de música'
  },
  {
    id: 'cine', title: 'Cine Drive-in', category: 'Arte', place: 'Setor de Clubes Norte', day: 'SÁB', date: '03', time: '18h30 — 23h', price: 'A partir de R$ 20',
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80', alt: 'Sala de cinema com poltronas vermelhas'
  },
  {
    id: 'cerrado', title: 'Manhã no Cerrado', category: 'Ao ar livre', place: 'Jardim Botânico de Brasília', day: 'DOM', date: '04', time: '8h — 11h', price: 'A partir de R$ 5',
    image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=80', alt: 'Trilha cercada pela vegetação do cerrado'
  },
  {
    id: 'vinil', title: 'Feira de Vinil', category: 'Música', place: '304 Sul · comércio local', day: 'DOM', date: '04', time: '10h — 17h', price: 'Entrada grátis',
    image: 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?auto=format&fit=crop&w=900&q=80', alt: 'Discos de vinil em uma coleção musical'
  },
  {
    id: 'ceramica', title: 'Barro & Café', category: 'Arte', place: 'Casa do Cantador · Ceilândia', day: 'SÁB', date: '03', time: '14h — 19h', price: 'A partir de R$ 15',
    image: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=900&q=80', alt: 'Peças de cerâmica artesanal sobre uma mesa'
  },
  {
    id: 'pastel', title: 'Festival do Pastel', category: 'Comida', place: 'Praça do Cruzeiro', day: 'DOM', date: '04', time: '11h — 20h', price: 'Entrada grátis',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80', alt: 'Prato de comida servido em uma mesa'
  },
  {
    id: 'pedal', title: 'Pedal no Parque', category: 'Ao ar livre', place: 'Parque da Cidade · Portão 5', day: 'DOM', date: '04', time: '7h — 10h', price: 'Grátis',
    image: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=900&q=80', alt: 'Ciclista pedalando em uma trilha arborizada'
  }
];

const grid = document.querySelector('#event-grid');
const searchInput = document.querySelector('#event-search');
const emptyState = document.querySelector('#empty-state');
const resultsCount = document.querySelector('#results-count');
const savedToggle = document.querySelector('#saved-toggle');
const savedNumber = document.querySelector('#saved-number');
const filters = [...document.querySelectorAll('.filter-button')];
let activeCategory = 'Todos';
let showSavedOnly = false;
let savedEvents = new Set();

try {
  savedEvents = new Set(JSON.parse(localStorage.getItem('bora-df-saved') || '[]'));
} catch {
  savedEvents = new Set();
}

function renderEvents() {
  const query = searchInput.value.trim().toLocaleLowerCase('pt-BR');
  const visibleEvents = events.filter((event) => {
    const matchesCategory = activeCategory === 'Todos' || event.category === activeCategory;
    const matchesQuery = `${event.title} ${event.place} ${event.category}`.toLocaleLowerCase('pt-BR').includes(query);
    const matchesSaved = !showSavedOnly || savedEvents.has(event.id);
    return matchesCategory && matchesQuery && matchesSaved;
  });

  grid.innerHTML = visibleEvents.map((event, index) => `
    <article class="event-card" data-category="${event.category}" style="animation-delay:${index * 45}ms">
      <div class="event-image-wrap">
        <img class="event-image" src="${event.image}" alt="${event.alt}" loading="lazy">
        <span class="event-day">${event.day}<strong>${event.date}</strong></span>
        <button class="save-button${savedEvents.has(event.id) ? ' is-saved' : ''}" type="button" data-save="${event.id}" aria-label="${savedEvents.has(event.id) ? 'Remover' : 'Salvar'} ${event.title}" aria-pressed="${savedEvents.has(event.id)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.8L6 21V4.75Z"></path></svg>
        </button>
      </div>
      <div class="event-info">
        <div class="event-category"><span class="category-dot"></span>${event.category}</div>
        <h3>${event.title}</h3>
        <p class="event-place">${event.place}</p>
        <div class="event-meta"><span>${event.time}</span><span class="event-price">${event.price}</span></div>
      </div>
    </article>
  `).join('');

  emptyState.hidden = visibleEvents.length > 0;
  grid.hidden = visibleEvents.length === 0;
  resultsCount.textContent = `${visibleEvents.length} ${visibleEvents.length === 1 ? 'rolê encontrado' : 'rolês encontrados'}`;
  savedNumber.textContent = savedEvents.size;
  savedToggle.setAttribute('aria-pressed', String(showSavedOnly));
}

filters.forEach((button) => {
  button.addEventListener('click', () => {
    activeCategory = button.dataset.category;
    filters.forEach((filter) => {
      const selected = filter === button;
      filter.classList.toggle('selected', selected);
      filter.setAttribute('aria-pressed', String(selected));
    });
    renderEvents();
  });
});

searchInput.addEventListener('input', renderEvents);
savedToggle.addEventListener('click', () => {
  showSavedOnly = !showSavedOnly;
  renderEvents();
});
grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-save]');
  if (!button) return;
  const id = button.dataset.save;
  if (savedEvents.has(id)) savedEvents.delete(id);
  else savedEvents.add(id);
  try {
    localStorage.setItem('bora-df-saved', JSON.stringify([...savedEvents]));
  } catch {
    // A sessão continua funcionando mesmo se o navegador bloquear o armazenamento local.
  }
  renderEvents();
});
document.querySelector('#clear-filters').addEventListener('click', () => {
  activeCategory = 'Todos';
  showSavedOnly = false;
  searchInput.value = '';
  filters.forEach((filter) => {
    const selected = filter.dataset.category === 'Todos';
    filter.classList.toggle('selected', selected);
    filter.setAttribute('aria-pressed', String(selected));
  });
  renderEvents();
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) searchInput.blur();
});

renderEvents();
