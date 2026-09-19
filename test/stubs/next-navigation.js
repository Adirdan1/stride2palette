// Router stub for the render probes. The probes render components to static
// HTML to measure their layout; nothing navigates, so the hooks only have to
// exist and return something inert.
export const useRouter = () => ({
  refresh: () => {},
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
});
export const usePathname = () => '/';
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export const notFound = () => {};
export const redirect = () => {};
