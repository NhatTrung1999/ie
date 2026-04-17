import { Controller, Get } from '@nestjs/common';
import { IdentityService } from './identity.service';

@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get()
  async getIdentity() {
    return this.identityService.getIdentity();
  }

  @Get('register')
  async registerDevice() {
    return this.identityService.registerDevice();
  }
}
