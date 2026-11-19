import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Auth } from '../auth/auth.guard';
import { GenerateCodesDto } from './licenses.dto';
import { LicensesService } from './licenses.service';

@Controller('admin')
@Auth('SUPER_ADMIN')
export class AdminLicensesController {
  constructor(private readonly licenses: LicensesService) {}

  /** Returns the codes in clear: this is the only time they can be read. */
  @Post('clients/:id/codes')
  generateCodes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GenerateCodesDto,
  ) {
    return this.licenses.generateCodes(id, body);
  }

  @Get('clients/:id/codes')
  findCodes(@Param('id', ParseUUIDPipe) id: string) {
    return this.licenses.findCodes(id);
  }

  @Post('codes/:id/revoke')
  @HttpCode(200)
  revokeCode(@Param('id', ParseUUIDPipe) id: string) {
    return this.licenses.revokeCode(id);
  }

  @Get('clients/:id/licenses')
  findLicenses(@Param('id', ParseUUIDPipe) id: string) {
    return this.licenses.findLicenses(id);
  }

  @Post('licenses/:id/revoke')
  @HttpCode(200)
  revokeLicense(@Param('id', ParseUUIDPipe) id: string) {
    return this.licenses.revokeLicense(id);
  }
}
