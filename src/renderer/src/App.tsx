import { useLibrary } from './store/useLibrary'
import Home from './pages/Home'
import Grid from './pages/Grid'

function App(): JSX.Element {
  const view = useLibrary((s) => s.view)
  return view === 'home' ? <Home /> : <Grid />
}

export default App
