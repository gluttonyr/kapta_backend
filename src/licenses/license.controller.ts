import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Auth, CurrentClientUser } from '../auth/auth.guard';
import { ClientUser } from '../clients/client-user.entity';
import { ActivateDto, LicenseStatusQuery } from './licenses.dto';
import { LicensesService } from './licenses.service';

/** Called by the Kapta app, signed in with a client account. */
@Controller('license')
@Auth('CLIENT')
export class LicenseController {
  constructor(private readonly licenses: LicensesService) {}

  @Post('activate')
  @HttpCode(200)
  activate(@CurrentClientUser() user: ClientUser, @Body() body: ActivateDto) {
    return this.licenses.activate(user, body.code, body.deviceId);
  }

  @Get('status')
  status(
    @CurrentClientUser() user: ClientUser,
    @Query() query: LicenseStatusQuery,
  ) {
    return this.licenses.status(user, query.deviceId);
  }
}
