// =========================================================
// App — hash router
// =========================================================
function App() {
  const hash = useHashRoute();

  // restore last route on first load
  useEffect(() => {
    if (hash === '#/' || hash === '' || hash === '#') {
      try {
        const last = localStorage.getItem('kl_last_route');
        if (last && last !== '#/' && window.location.hash === '') {
          window.location.hash = last;
        }
      } catch (e) {}
    }
  }, []); // eslint-disable-line

  const path = hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean);

  let screen;
  if (parts.length === 0)                            screen = <Landing/>;
  else if (parts[0] === 'projects' && parts.length === 1) screen = <Projects/>;
  else if (parts[0] === 'projects' && parts[1])      screen = <ProjectDetail projectId={parts[1]}/>;
  else if (parts[0] === 'prices')                    screen = <Prices/>;
  else if (parts[0] === 'regulatory')                screen = <Regulatory/>;
  else if (parts[0] === 'alerts')                    screen = <Alerts/>;
  else                                               screen = <Landing/>;

  return screen;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
