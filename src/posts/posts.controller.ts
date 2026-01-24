import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { Post as PostModel } from 'src/generated/prisma/client';

import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get(':id')
  async getPostById(@Param('id') id: string): Promise<PostModel> {
    const post = await this.postsService.post({ id: Number(id) });
    if (!post) throw new NotFoundException();

    return post;
  }

  @Get('feed')
  async getPublishedPosts(): Promise<PostModel[]> {
    return this.postsService.posts({
      where: { published: true },
    });
  }

  @Get('filtered-posts/:searchString')
  async getFilteredPosts(
    @Param('searchString') searchString: string,
  ): Promise<PostModel[]> {
    return this.postsService.posts({
      where: {
        OR: [
          {
            title: { contains: searchString },
          },
          {
            content: { contains: searchString },
          },
        ],
      },
    });
  }

  @Post()
  async createDraft(
    @Body() postData: { title: string; content?: string; authorEmail: string },
  ): Promise<PostModel> {
    const { title, content, authorEmail } = postData;
    return this.postsService.createPost({
      title,
      content,
      author: {
        connect: { email: authorEmail },
      },
    });
  }

  @Put(':id')
  async publishPost(@Param('id') id: string): Promise<PostModel> {
    return this.postsService.updatePost({
      where: { id: Number(id) },
      data: { published: true },
    });
  }

  @Delete(':id')
  async deletePost(@Param('id') id: string): Promise<PostModel> {
    return this.postsService.deletePost({ id: Number(id) });
  }
}
