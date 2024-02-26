import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { TeamCollectionService } from './team-collection.service';
import { throwHTTPErr } from 'src/auth/helper';
import * as E from 'fp-ts/Either';
import { ThrottlerBehindProxyGuard } from 'src/guards/throttler-behind-proxy.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RequiresTeamRole } from 'src/team/decorators/requires-team-role.decorator';
import { TeamMemberRole } from '@prisma/client';
import { RESTTeamMemberGuard } from 'src/team/guards/rest-team-member.guard';

@UseGuards(ThrottlerBehindProxyGuard)
@Controller({ path: 'team-collection', version: '1' })
export class TeamCollectionController {
  constructor(private readonly teamCollectionService: TeamCollectionService) {}

  @Get('search/:teamID/:searchQuery')
  @RequiresTeamRole(
    TeamMemberRole.VIEWER,
    TeamMemberRole.EDITOR,
    TeamMemberRole.OWNER,
  )
  @UseGuards(JwtAuthGuard, RESTTeamMemberGuard)
  async searchByTitle(@Param('searchQuery') searchQuery: string) {
    const res = await this.teamCollectionService.searchByTitle(searchQuery);
    if (E.isLeft(res)) throwHTTPErr(res.left);
    return res.right;
  }
}