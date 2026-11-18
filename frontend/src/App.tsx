import { useEffect } from "react";
import { Outlet, Route, Routes, useParams } from "react-router-dom";

import { Layout } from "./components/Layout";
import { TokensProvider } from "./hooks/useTokens";
import { ActionsPage } from "./pages/ActionsPage";
import { HomePage } from "./pages/HomePage";
import { NewPullPage } from "./pages/NewPullPage";
import { PullDetailPage } from "./pages/PullDetailPage";
import { PullListPage } from "./pages/PullListPage";
import { RunDetailPage } from "./pages/RunDetailPage";
import { TokensPage } from "./pages/TokensPage";
import { rememberRepo } from "./utils/repo";

// Wraps every repo page; remembers the open repo so the app reopens there.
function RepoScope() {
  const { owner, repo } = useParams();
  useEffect(() => {
    if (owner && repo) rememberRepo(`${owner}/${repo}`);
  }, [owner, repo]);
  return <Outlet />;
}

function NotFound() {
  return <p className="muted">Page not found.</p>;
}

export function App() {
  return (
    <TokensProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="tokens" element={<TokensPage />} />
          <Route path=":owner/:repo" element={<RepoScope />}>
            <Route path="pulls" element={<PullListPage />} />
            <Route path="pulls/new" element={<NewPullPage />} />
            <Route path="pulls/:number" element={<PullDetailPage />} />
            <Route path="actions" element={<ActionsPage />} />
            <Route path="actions/runs/:runId" element={<RunDetailPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </TokensProvider>
  );
}
