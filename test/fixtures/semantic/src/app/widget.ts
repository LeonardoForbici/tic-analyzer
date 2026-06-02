import { UserService } from '@/services';

export class Widget {
  run(): string {
    return new UserService().load();
  }
}
