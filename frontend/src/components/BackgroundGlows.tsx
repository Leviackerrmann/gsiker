export default function BackgroundGlows() {
  return (
    <>
      <div style={{
        position: "fixed", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none",
        zIndex: 0, width: 400, height: 400, background: "var(--glow-a)", top: -100, right: 100,
        transition: "var(--transition)",
      }} />
      <div style={{
        position: "fixed", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none",
        zIndex: 0, width: 300, height: 300, background: "var(--glow-b)", bottom: -50, left: 300,
        transition: "var(--transition)",
      }} />
    </>
  );
}
