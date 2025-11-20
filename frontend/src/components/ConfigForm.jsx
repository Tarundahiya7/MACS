// frontend/src/components/ConfigForm.jsx
import { Database, BarChart2, Plus, Trash2, MoreVertical } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const blankSystem = { total_frames: '', page_size: '', cpu_quantum: '', memory_threshold: '', cpu_idle_gap: '1' };
const blankProcess = (i = 1) => ({ pid: `P${i}`, arrival_time: '', burst_time: '', priority: '', pages_count: '' });

export default function ConfigForm({ system, setSystem, processes, setProcesses }) {
  const [openMenu, setOpenMenu] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0 });
  const [isDark, setIsDark] = useState(false);
  const MENU_WIDTH = 320; // tweak width if you want wider/narrower

  // detect current dark mode by checking <html> class (supports 'class' strategy)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    const update = () => setIsDark(root.classList.contains('dark'));
    update();

    // Observe changes to class attribute so portal stays in sync with theme toggles
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class') {
          update();
          break;
        }
      }
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => mo.disconnect();
  }, []);

  // compute menu position relative to the trigger button
  const updateMenuPosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const margin = 12;

    // prefer aligning right edge of the menu with the right edge of the button
    let left = rect.right - MENU_WIDTH;
    if (left < margin) left = margin; // prevent left overflow
    if (left + MENU_WIDTH > viewportWidth - margin) left = viewportWidth - MENU_WIDTH - margin; // prevent right overflow

    const top = rect.bottom + 8; // menu below the button
    setMenuStyle({ top, left });
  };

  // close when clicking outside the menu or button, and update on scroll/resize
  useEffect(() => {
    function handleDown(e) {
      if (!openMenu) return;
      const target = e.target;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpenMenu(false);
      }
    }
    function handleScrollResize() {
      if (openMenu) updateMenuPosition();
    }
    document.addEventListener('mousedown', handleDown);
    window.addEventListener('resize', handleScrollResize);
    // listen in capture phase to catch scrolls in any scrollable ancestor
    window.addEventListener('scroll', handleScrollResize, true);

    return () => {
      document.removeEventListener('mousedown', handleDown);
      window.removeEventListener('resize', handleScrollResize);
      window.removeEventListener('scroll', handleScrollResize, true);
    };
  }, [openMenu]);

  // recalc position when menu opens
  useEffect(() => {
    if (openMenu) {
      updateMenuPosition();
      // small retry for cases where layout changes just after open
      const t = setTimeout(updateMenuPosition, 40);
      return () => clearTimeout(t);
    }
  }, [openMenu]);

  const updateSystem = (key, value) => setSystem((prev) => ({ ...prev, [key]: value }));
  const updateProcess = (index, key, value) =>
    setProcesses((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));

  const addProc = () => setProcesses((prev) => [...prev, blankProcess(prev.length + 1)]);
  const removeProc = (indexToRemove) => setProcesses((prev) => prev.filter((_, i) => i !== indexToRemove));

  // Portal content uses Tailwind classes and respects dark mode by applying 'dark' on the outer wrapper
  const MenuPortal = (
    <div
      ref={menuRef}
      role="dialog"
      aria-modal="false"
      className={`${isDark ? 'dark' : ''}`} // ensure dark: classes inside work
      style={{
        position: 'fixed',
        top: `${menuStyle.top}px`,
        left: `${menuStyle.left}px`,
        width: `${MENU_WIDTH}px`,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      <div className="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl p-4">
        <h3 className="text-md font-semibold mb-3 flex items-center gap-2">
          <Database size={16} /> System Parameters
        </h3>

        <div className="grid grid-cols-1 gap-3">
          {Object.entries(system).map(([k, v]) => (
            <label key={k} className="grid text-sm gap-1">
              <span className="opacity-80 capitalize">{k.replaceAll('_', ' ')}</span>
              <input
                value={v}
                onChange={(e) => updateSystem(k, e.target.value)}
                type="number"
                className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 text-inherit"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 relative ">
      {/* Three-dots menu trigger */}
      <div className="absolute top-5 right-4 z-30 ">
        <button
          ref={buttonRef}
          className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 "
          onClick={() => setOpenMenu((o) => !o)}
          aria-haspopup="true"
          aria-expanded={openMenu}
          title="System parameters"
        >
          <MoreVertical size={24} />
        </button>
      </div>

      {/* Render portal into body so it can't be overlapped or clipped by siblings */}
      {openMenu && typeof document !== 'undefined' && createPortal(MenuPortal, document.body)}

      {/* Process Section */}
      <section className="card p-5 relative z-10">
        <div className="flex items-center justify-between mb-4 pr-10">
          <h3 className="text-lg font-semibold flex items-center gap-2"><BarChart2 size={18}/> Processes</h3>
          <button onClick={addProc} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-xl text-sm text-white">
            <Plus size={16}/> Add process
          </button>
        </div>

        <div className="table-wrap">
          <table className="min-w-full text-sm border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
            <thead className="bg-black/5 dark:bg-white/10">
              <tr>
                {['pid','arrival_time','burst_time','priority','pages_count','actions'].map((h) => (
                  <th key={h} className="text-left p-2 capitalize">{h.replaceAll('_',' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processes.map((p, i) => (
                <tr key={i} className="odd:bg-transparent even:bg-black/5 dark:even:bg-white/10">
                  <td className="p-2">
                    <input className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 w-28"
                           value={p.pid} onChange={(e) => updateProcess(i,'pid', e.target.value)} />
                  </td>
                  {['arrival_time','burst_time','priority','pages_count'].map((k) => (
                    <td key={k} className="p-2">
                      <input type="number"
                             className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 w-36"
                              value={p[k]} onChange={(e) => updateProcess(i,k, e.target.value)} />
                    </td>
                  ))}
                  <td className="p-2">
                    <button onClick={() => removeProc(i)} className="inline-flex items-center gap-1 text-red-500 hover:text-red-400">
                      <Trash2 size={16}/> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
