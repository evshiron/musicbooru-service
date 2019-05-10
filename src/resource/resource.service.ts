
import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import { join } from 'path';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { getRepository } from 'typeorm';
import * as request from 'request-promise-native';
import fileType = require('file-type');
import * as musicAPI from '@suen/music-api';

import { Song, SongResource } from '../database/database.model';
import { ConfigService } from '../config/config.service';

@Injectable()
export class ResourceService {
  constructor(private configService: ConfigService) {
    setTimeout(async () => {
      await this.bootstrapSongs();
      await this.prepareSongs();
    }, 1000);
  }

  async makeHashedPath(data: Buffer): Promise<string> {
    const { ext } = fileType(data);

    const hasher = createHash('md5');
    hasher.update(data);
    const hash = hasher.digest().toString('hex');

    return join(hash.slice(0, 2), hash.slice(2, 4), `${ hash }.${ ext }`);
  }

  async bootstrapSongs() {
    const songRepo = getRepository(Song);

    const dir = './bootstrap';

    const files = await fs.readdir(dir);
    for (const file of files) {
      const path = join(dir, file);
      if (path.indexOf('xiami-fav') !== 0) {
        const data = JSON.parse(await fs.readFile(path, 'utf8'));
        const { songs } = data.result.data;
        for (const song of songs) {
          const count = await songRepo.count({
            rawSource: 'xiami',
            artistName: song.artistName,
            albumName: song.albumName,
            songName: song.songName,
          });
          if (count > 0) {
            console.debug(
              'bootstrapSongs:',
              `(xiami, ${ song.artistName }, ${ song.albumName }, ${ song.songName }) exists`);
            continue;
          }

          const songRow = new Song();
          songRow.albumName = song.albumName;
          songRow.artistName = (song.artistVOs[0] && song.artistVOs[0].artistName)
            || song.artistName;
          songRow.songName = song.songName;
          songRow.rawSource = 'xiami';
          songRow.rawData = song;

          await songRepo.save(songRow);
          console.debug(
            'bootstrapSongs:',
            `(xiami, ${ songRow.artistName }, ${ songRow.albumName }, ${ songRow.songName }) added`);
        }
      }
    }
  }

  async prepareSongs() {
    const songRepo = getRepository(Song);
    const songs = await songRepo.find({
      where: {
        status: 'valid',
      },
      relations: [
        'resources',
      ],
    });

    const pendingSongs = songs
      .filter(item => item.resources.length === 0)
      .sort(() => Math.random() - 0.5);
    console.debug(`${ pendingSongs.length } songs pending`);

    for (const song of pendingSongs) {
      try {
        await this.fetchSong(song);
        await new Promise((resolve) => {
          setTimeout(resolve, 10000);
        });
      } catch (err) {
        song.status = 'errored';
        await songRepo.save(song);
        console.warn(err);
      }

    }
  }

  async fetchSong(song: Song) {
    const songResourceRepo = getRepository(SongResource);

    console.debug(
      'fetchSong:',
      `(${ song.rawSource }, ${ song.artistName }, ${ song.songName }) handled`);

    const keywords = `${ song.artistName } ${ song.songName }`;
    const searchResult = await (musicAPI as any).default.searchSong(keywords);
    if (!searchResult.status) {
      throw new Error('search song failed');
    }

    const songs = [
      ...searchResult.data.qq.songs.map((item) => {
        return {
          ...item,
          source: 'qq',
        };
      }),
      ...searchResult.data.xiami.songs.map((item) => {
        return {
          ...item,
          source: 'xiami',
        };
      }),
      ...searchResult.data.netease.songs.map((item) => {
        return {
          ...item,
          source: 'netease',
        };
      }),
    ].map((sourcedSong) => {
      return {
        'source': sourcedSong.source,
        'id': sourcedSong.id,
        'albumName': sourcedSong.album.name,
        'artistName': sourcedSong.artists.map(artist => artist.name).join(' '),
        'songName': sourcedSong.name,
        'copyrighted': sourcedSong.cp,
        'downloadable': sourcedSong.dl,
        'lossless': sourcedSong.quality['999'],
        '320kbps': sourcedSong.quality['320'],
        '192kbps': sourcedSong.quality['192'],
      };
    });

    const bestSong = songs.reduce((pv, cv) => {
      if (cv.artistName === song.artistName
        && cv.songName === song.songName) {
        if (!pv) {
          return cv;
        }

        if (cv.lossless) {
          return cv;
        }

        if (!pv.lossless && cv['320kbps']) {
          return cv;
        }
      }

      return pv;
    }, null);

    if (!bestSong) {
      throw new Error('best song not found');
    }

    console.info(bestSong);

    const quality = (songParam: any) => {
      if (songParam.lossless) {
        return 'lossless';
      } else if (songParam['320kbps']) {
        return '320kbps';
      } else if (songParam['192kbps']) {
        return '192kbps';
      } else {
        return 'unknown';
      }
    };

    const songResource = new SongResource();
    songResource.albumName = bestSong.albumName;
    songResource.artistName = bestSong.artistName;
    songResource.songName = bestSong.songName;
    songResource.source = bestSong.source;
    songResource.quality = quality(bestSong);

    const count = await songResourceRepo.count(songResource);
    if (count > 0) {
      console.info('song resource exists');
      return;
    }

    const urlResult = await (musicAPI as any).default.getSongUrl(bestSong.source, bestSong.id);
    if (!urlResult.status) {
      throw new Error('fetch song failed');
    }

    const { url }  = urlResult.data;

    let body;
    if (songResource.source === 'netease') {
      body = await this.getSongData2(url);
    } else {
      body = await this.getSongData(url);
    }

    const path = await this.makeHashedPath(body);
    const realPath = join(this.configService.DATA_DIR, path);
    await fs.outputFile(realPath, body);

    songResource.path = path;
    songResource.song = song;

    songResourceRepo.save(songResource);

    console.debug(
      'fetchSong:',
      `(${ songResource.source }, ${ songResource.artistName }, ${ songResource.songName }, ${ songResource.quality }) added`);
  }

  async getSongData(url: string): Promise<Buffer> {
    return request(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
      },
      encoding: null,
      timeout: 30000,
    });
  }

  getSongData2(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const curl = spawn('curl', [ url ]);

      let stdout;
      let stderr;

      curl.stdout.on('data', (chunk) => {
        if (!stdout) {
          stdout = chunk;
        } else {
          stdout = Buffer.concat([stdout, chunk]);
        }
      });

      curl.stderr.on('data', (chunk) => {
        if (!stderr) {
          stderr = chunk;
        } else {
          stderr = Buffer.concat([stderr, chunk]);
        }
      });

      curl.on('close', (code) => {
        if (code) {
          return reject(new Error(stderr.toString()));
        } else {
          return resolve(stdout);
        }
      });
    });
  }
}
