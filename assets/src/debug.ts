// Debug gate, resolved once at module load. `?debug=1` persists to localStorage
// and sticks across reloads; `?debug=0` clears it. Lives in its own leaf module
// so both main.tsx (mount the overlay) and router.ts (re-throw route errors into
// the overlay) read the same resolved value regardless of import order.
const param = new URLSearchParams(window.location.search).get("debug")
if (param === "1") localStorage.setItem("debug", "1")
else if (param === "0") localStorage.removeItem("debug")

export const debug = localStorage.getItem("debug") === "1"
