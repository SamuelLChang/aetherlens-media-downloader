import Layout from './components/Layout';
import { DownloadProvider } from './context/DownloadContext';
import { ThemeProvider } from './context/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <DownloadProvider>
        <Layout />
      </DownloadProvider>
    </ThemeProvider>
  );
}

export default App;
