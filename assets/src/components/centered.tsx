/** Full-height centered slot for neutral loading/empty states. */
export function Centered(props: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      {props.children}
    </div>
  );
}
