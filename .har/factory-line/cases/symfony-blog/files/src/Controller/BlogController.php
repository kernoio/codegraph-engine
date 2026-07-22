<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

/**
 * Trimmed from https://github.com/symfony/demo — src/Controller/BlogController.php
 */
#[Route('/blog')]
final class BlogController extends AbstractController
{
    #[Route('/', name: 'blog_index', methods: ['GET'])]
    #[Route('/rss.xml', name: 'blog_rss', methods: ['GET'])]
    #[Route('/page/{page}', name: 'blog_index_paginated', requirements: ['page' => Requirement::POSITIVE_INT], methods: ['GET'])]
    public function index(): Response
    {
        return new Response();
    }

    #[Route('/posts/{slug:post}', name: 'blog_post', methods: ['GET'])]
    public function postShow(): Response
    {
        return new Response();
    }

    #[Route('/comment/{postSlug}/new', name: 'comment_new', methods: ['POST'])]
    public function commentNew(): Response
    {
        return new Response();
    }

    #[Route('/search', name: 'blog_search', methods: ['GET'])]
    public function search(): Response
    {
        return new Response();
    }
}
