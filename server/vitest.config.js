import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // test files แชร์ TEST_DATABASE_URL เดียวกัน — รันขนานทำให้ global settings
    // (เช่น maker_checker) แย่งกันเขียน/อ่าน → flaky; บังคับ sequential
    fileParallelism: false,
    server: {
      deps: {
        external: ['node:sqlite'],
      },
    },
  },
});
