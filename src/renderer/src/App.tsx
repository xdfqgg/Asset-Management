import { useLibrary } from './store/useLibrary'
import Home from './pages/Home'
import Grid from './pages/Grid'
import Settings from './pages/Settings'

function App(): JSX.Element {
  const view = useLibrary((s) => s.view)
  if (view === 'home') return <Home />
  if (view === 'settings') return <Settings />
  return <Grid />
}

export default App
