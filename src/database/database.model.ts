/* tslint:disable max-classes-per-file */
import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Artist {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  aliases: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}

@Entity()
export class Song {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  albumName: string;

  @Column()
  artistName: string;

  @Column()
  songName: string;

  @Column()
  rawSource: string;

  @Column('simple-json')
  rawData: any;

  @OneToMany(type => SongResource, resource => resource.song)
  resources: SongResource[];

  @Column({
    default: 'valid',
  })
  status: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}

@Entity()
export class SongResource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  albumName: string;

  @Column()
  artistName: string;

  @Column()
  songName: string;

  @Column()
  source: string;

  @Column()
  quality: string;

  @Column()
  path: string;

  @ManyToOne(type => Song, song => song.resources)
  song: Song;

  @Column({
    default: 'valid',
  })
  status: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
