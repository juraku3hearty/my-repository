import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setEntryPoint("./src/index.ts");
Config.setConcurrency(2); // 2GBメモリでも落ちにくいよう控えめに(Macなら上げてOK)
