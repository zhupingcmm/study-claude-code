const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function startSpinner(label: string): () => void {
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${SPINNER_FRAMES[i++ % SPINNER_FRAMES.length]} ${label}`);
  }, 80);
  // \r 回到行首，\x1b[2K 清除整行
  return () => {
    clearInterval(id);
    process.stdout.write("\r\x1b[2K");
  };
}
