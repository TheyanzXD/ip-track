// js/map.js — Geo map visualization: zero-dep canvas, equirectangular, pan/zoom, batch markers (TODO 15)
(function () {
  // Coarse continent outlines (lat/lon polygons) as offline fallback; world-atlas fetched at runtime when online.
  const COARSE_WORLD = [
    { name: 'North America', points: [[60,-170],[72,-140],[71,-100],[69,-75],[62,-64],[52,-55],[47,-52],[45,-63],[40,-73],[30,-81],[25,-80],[25,-90],[29,-94],[26,-97],[23,-97],[18,-94],[15,-88],[12,-85],[16,-90],[20,-97],[27,-101],[23,-106],[28,-114],[33,-117],[37,-122],[40,-124],[48,-125],[54,-131],[60,-140]] },
    { name: 'South America', points: [[12,-71],[10,-62],[8,-60],[2,-51],[-4,-37],[-8,-35],[-23,-41],[-30,-50],[-34,-58],[-42,-64],[-48,-67],[-53,-70],[-51,-74],[-42,-73],[-33,-72],[-20,-70],[-6,-81],[0,-80],[6,-78],[10,-73]] },
    { name: 'Europe', points: [[36,-10],[38,-9],[43,-9],[46,-2],[48,-5],[50,-4],[53,-1],[54,8],[58,10],[62,6],[71,25],[70,30],[64,39],[60,33],[56,21],[55,12],[52,16],[50,18],[48,24],[44,28],[41,29],[39,23],[37,21],[36,15],[36,-5]] },
    { name: 'Africa', points: [[37,10],[33,19],[31,32],[27,34],[23,37],[18,38],[12,44],[5,48],[-5,40],[-12,38],[-18,36],[-25,35],[-34,26],[-35,20],[-30,16],[-24,14],[-18,12],[-10,13],[-5,9],[0,9],[4,8],[8,5],[10,-13],[15,-17],[20,-17],[28,-12],[32,-9],[37,10]] },
    { name: 'Asia', points: [[40,26],[36,32],[30,34],[24,37],[22,40],[26,47],[35,53],[43,50],[45,42],[50,44],[55,48],[60,55],[68,67],[72,70],[76,73],[65,80],[60,82],[55,86],[52,90],[46,92],[40,94],[35,92],[30,90],[22,92],[16,96],[12,96],[8,100],[1,104],[6,115],[8,122],[14,128],[20,132],[28,140],[36,142],[40,141],[42,138],[44,132],[50,142],[58,150],[62,163],[68,178],[70,-170],[66,-160],[60,-155],[52,-160],[45,-165],[38,-145],[35,-130],[30,-125],[25,-120],[30,-115],[35,-112],[40,-112],[43,-118],[48,-124],[54,-128],[58,-134],[60,-140],[55,-150],[50,-145],[48,-132],[44,-128],[40,-128],[36,-122],[32,-118],[30,-115],[25,-118],[20,-112],[18,-108],[16,-100],[15,-92],[12,-86],[10,-84],[8,-80],[5,-78],[2,-78],[0,-80],[-2,-80],[-5,-84],[-8,-80],[-10,-78],[-13,-76],[-15,-75],[-18,-70],[-20,-70]] },
    { name: 'Australia', points: [[-12,130],[-10,135],[-14,137],[-17,142],[-20,148],[-25,152],[-30,153],[-34,151],[-37,149],[-39,147],[-38,142],[-35,138],[-33,135],[-30,131],[-26,128],[-22,124],[-18,122],[-14,125],[-12,130]] }
  ];

  function project(lat, lon) {
    return [(lon + 180) / 360, (90 - lat) / 180];
  }

  function MarkerMap(canvas, { onMarkerHover } = {}) {
    const ctx = canvas.getContext('2d');
    let view = { zoom: 1, panX: 0, panY: 0 }; // pan in [0,1] space
    let markers = [];
    let worldBorders = null;
    let raf = null;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function worldX(lon) { return (lon + 180) / 360 * canvas.clientWidth * view.zoom - view.panX; }
    function worldY(lat) { return (90 - lat) / 180 * canvas.clientHeight * view.zoom - view.panY; }

    function draw() {
      if (!ctx) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      ctx.fillStyle = theme === 'dark' ? '#141412' : '#eef2f6';
      ctx.fillRect(0, 0, w, h);
      // graticule
      ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      for (let lon = -180; lon <= 180; lon += 30) {
        ctx.beginPath();
        ctx.moveTo(worldX(lon), 0); ctx.lineTo(worldX(lon), h); ctx.stroke();
      }
      for (let lat = -90; lat <= 90; lat += 30) {
        ctx.beginPath();
        ctx.moveTo(0, worldY(lat)); ctx.lineTo(w, worldY(lat)); ctx.stroke();
      }
      // borders
      const polys = worldBorders || COARSE_WORLD;
      ctx.strokeStyle = theme === 'dark' ? '#2E2E2A' : '#c8d3dd';
      ctx.lineWidth = 1;
      ctx.fillStyle = theme === 'dark' ? '#1A1A18' : '#ffffff';
      for (const poly of polys) {
        ctx.beginPath();
        poly.points.forEach(([lat, lon], i) => {
          const x = worldX(lon), y = worldY(lat);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // markers
      markers.forEach((m, i) => {
        const x = worldX(m.longitude), y = worldY(m.latitude);
        if (x < -30 || x > w + 30 || y < -30 || y > h + 30) return;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#635BFF';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = theme === 'dark' ? '#F5F4F0' : '#18180f';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(m.label || m.ip || '', x + 8, y + 4);
      });
    }

    function schedule() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }

    function setMarkers(list) {
      markers = list;
      schedule();
    }

    function setBorders(polys) {
      worldBorders = polys;
      schedule();
    }

    // interactions
    let drag = null;
    canvas.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, px: view.panX, py: view.panY }; });
    window.addEventListener('mousemove', e => {
      if (drag) {
        view.panX = Math.max(0, drag.px - (e.clientX - drag.x));
        view.panY = Math.max(0, drag.py - (e.clientY - drag.y));
        schedule();
      }
      hover(e);
    });
    window.addEventListener('mouseup', () => { drag = null; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      view.zoom = Math.min(20, Math.max(1, view.zoom * factor));
      schedule();
    }, { passive: false });

    function hover(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const found = markers.find(m => {
        const mx = worldX(m.longitude), my = worldY(m.latitude);
        return Math.hypot(mx - x, my - y) < 8;
      });
      if (found) onMarkerHover?.(found, e);
    }

    const reset = () => { view = { zoom: 1, panX: 0, panY: 0 }; schedule(); };
    const fit = () => reset();
    const getView = () => ({ ...view });

    resize();
    new ResizeObserver(resize).observe(canvas);
    schedule();

    return { setMarkers, setBorders, reset, fit, getView };
  }

  window.GeoMap = {
    create(canvas, opts) { return MarkerMap(canvas, opts); },
    loadWorldBorders() {
      return fetch('https://unpkg.com/world-atlas@2/countries-110m.json', { signal: AbortSignal.timeout(8000) })
        .then(r => r.json())
        .then(topology => {
          // convert topojson countries → coarse polygons (equirectangular)
          const polys = [];
          const transform = topology.transform;
          const arcs = topology.arcs;
          const geom = topology.objects.countries.geometries;
          const decode = (arcIndex) => {
            const arc = arcs[Math.abs(arcIndex)];
            let x = 0, y = 0;
            const pts = [];
            for (const [dx, dy] of arc) {
              x += dx; y += dy;
              pts.push([(y * transform.scale[1] + transform.translate[1]) / 10, (x * transform.scale[0] + transform.translate[0]) / 10]);
            }
            return pts;
          };
          for (const g of geom) {
            const rings = g.type === 'Polygon' ? [g.arcs] : g.arcs;
            for (const ring of rings) {
              let pts = [];
              for (const ai of ring) pts = pts.concat(decode(ai));
              if (pts.length > 20) polys.push({ name: g.properties?.name || '', points: pts });
            }
          }
          return polys;
        })
        .catch(() => null); // offline → coarse fallback
    }
  };
})();
