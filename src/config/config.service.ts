import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {

  readonly DATA_DIR = './data';

}
