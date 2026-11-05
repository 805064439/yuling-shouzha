// 用法: node --experimental-strip-types --import ./tools/ts_register.mjs tools/xxx.mjs
import { register } from 'node:module';
register(new URL('./ts_ext_loader.mjs', import.meta.url).href, import.meta.url);
