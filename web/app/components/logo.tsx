type LogoVariant = "auth" | "nav";

const logoStyles: Record<LogoVariant, React.CSSProperties> = {
  auth: {
    display: "block",
    width: 320,
    height: "auto",
    margin: "0 auto 28px",
  },
  nav: {
    display: "block",
    height: 30,
    width: "auto",
    flexShrink: 0,
  },
};

export function Logo({ variant }: { variant: LogoVariant }) {
  return (
    <img
      src="/redopsync.png"
      alt="RedOpSync"
      style={logoStyles[variant]}
    />
  );
}
